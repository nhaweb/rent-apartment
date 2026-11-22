/**
 * Room photo uploads (browser -> R2 directly) and removal. The browser never
 * sends image bytes to our server:
 *
 * 1. `prepareUploads`: ownership + limit check, then presigned PUT URLs for
 *    server-chosen keys (5 minutes, Content-Type locked to image/webp).
 * 2. The browser PUTs the resized WebP files to R2.
 * 3. `confirmUploads`: checks each object really exists, is a WebP of an
 *    allowed size without EXIF/XMP, reads its true dimensions, then saves rows.
 *    Objects that fail are deleted.
 *
 * Deleting photos or rooms removes the objects too (best effort; leftovers
 * are found by `npm run r2:orphans`).
 */
import type { RoomPhoto } from '../types';
import {
  addOwnRoomPhotos,
  countOwnRoomPhotos,
  deleteOwnRoom,
  deleteOwnRoomPhoto,
  getOwnRoom,
  type NewRoomPhoto,
} from './landlord-rooms';
import {
  fitWithin,
  MAX_FULL_BYTES,
  MAX_PHOTOS_PER_ROOM,
  MAX_THUMB_BYTES,
  parsePhotoKey,
  photoKeys,
  PHOTO_CACHE_CONTROL,
  PRESIGN_TTL_SECONDS,
  THUMB_MAX_EDGE,
  FULL_MAX_EDGE,
  UPLOAD_CONTENT_TYPE,
} from './photo-rules';
import { r2 } from './storage/r2';
import { readWebpInfo, WEBP_HEADER_BYTES, type WebpInfo } from './webp';

export interface PreparedUpload {
  key: string;
  thumbKey: string;
  /** Presigned PUT URLs; send `Content-Type: image/webp`. */
  url: string;
  thumbUrl: string;
}

export type PrepareResult =
  | { ok: true; uploads: PreparedUpload[] }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'limit'; remaining: number };

export async function prepareUploads(landlordId: string, roomId: string, count: number): Promise<PrepareResult> {
  const existing = await countOwnRoomPhotos(landlordId, roomId);
  if (existing === undefined) return { ok: false, reason: 'not-found' };
  const remaining = MAX_PHOTOS_PER_ROOM - existing;
  if (count > remaining) return { ok: false, reason: 'limit', remaining: Math.max(0, remaining) };

  const uploads = await Promise.all(
    Array.from({ length: count }, async () => {
      const keys = photoKeys(roomId, crypto.randomUUID());
      const [url, thumbUrl] = await Promise.all([
        r2.presignPut(keys.key, UPLOAD_CONTENT_TYPE, PRESIGN_TTL_SECONDS),
        r2.presignPut(keys.thumbKey, UPLOAD_CONTENT_TYPE, PRESIGN_TTL_SECONDS),
      ]);
      return { ...keys, url, thumbUrl };
    }),
  );
  return { ok: true, uploads };
}

/** Why an uploaded pair was refused; shown to the landlord per file. */
export type UploadProblem = 'missing' | 'invalid';

export type ConfirmResult =
  | { ok: true; photos: RoomPhoto[]; problems: { key: string; problem: UploadProblem }[] }
  | { ok: false; reason: 'not-found' | 'limit' };

async function inspect(key: string, maxBytes: number): Promise<WebpInfo | UploadProblem> {
  const head = await r2.head(key);
  if (!head) return 'missing';
  if (head.contentType !== UPLOAD_CONTENT_TYPE || head.size > maxBytes || head.size < WEBP_HEADER_BYTES) return 'invalid';
  const info = readWebpInfo(await r2.readStart(key, WEBP_HEADER_BYTES));
  if (!info || info.hasMetadata || info.animated) return 'invalid';
  return info;
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1;

export async function confirmUploads(
  landlordId: string,
  roomId: string,
  requested: { key: string; thumbKey: string }[],
): Promise<ConfirmResult> {
  // A retried or double-sent confirm may repeat keys; handle each once.
  const uploads = [...new Map(requested.map((upload) => [upload.key, upload])).values()];
  if ((await countOwnRoomPhotos(landlordId, roomId)) === undefined) return { ok: false, reason: 'not-found' };

  const accepted: NewRoomPhoto[] = [];
  const problems: { key: string; problem: UploadProblem }[] = [];
  const toDelete: string[] = [];

  await Promise.all(
    uploads.map(async ({ key, thumbKey }) => {
      const full = parsePhotoKey(key);
      const thumb = parsePhotoKey(thumbKey);
      // Keys must be the pair we issued for this room; anything else is not ours to touch.
      if (!full || !thumb || full.thumb || !thumb.thumb || full.roomId !== roomId || thumb.roomId !== roomId || full.uuid !== thumb.uuid) {
        problems.push({ key, problem: 'invalid' });
        return;
      }
      const [fullInfo, thumbInfo] = await Promise.all([inspect(key, MAX_FULL_BYTES), inspect(thumbKey, MAX_THUMB_BYTES)]);
      if (typeof fullInfo === 'string' || typeof thumbInfo === 'string') {
        problems.push({ key, problem: fullInfo === 'missing' || thumbInfo === 'missing' ? 'missing' : 'invalid' });
        toDelete.push(key, thumbKey);
        return;
      }
      const expectedThumb = fitWithin(fullInfo.width, fullInfo.height, THUMB_MAX_EDGE);
      const sizeOk =
        Math.max(fullInfo.width, fullInfo.height) <= FULL_MAX_EDGE &&
        near(thumbInfo.width, expectedThumb.width) &&
        near(thumbInfo.height, expectedThumb.height);
      if (!sizeOk) {
        problems.push({ key, problem: 'invalid' });
        toDelete.push(key, thumbKey);
        return;
      }
      accepted.push({ id: full.uuid, key, thumbKey, width: fullInfo.width, height: fullInfo.height });
    }),
  );

  // Keep the order the browser sent them in.
  const order = new Map(uploads.map((upload, index) => [upload.key, index]));
  accepted.sort((a, b) => order.get(a.key)! - order.get(b.key)!);

  const saved = await addOwnRoomPhotos(landlordId, roomId, accepted);
  if (saved !== 'ok') {
    // Never delete the objects of photos that are saved (from an earlier, retried confirm).
    const kept = new Set((await getOwnRoom(landlordId, roomId))?.photos.map((photo) => photo.key));
    toDelete.push(...accepted.filter((photo) => !kept.has(photo.key)).flatMap((photo) => [photo.key, photo.thumbKey]));
  }
  await removeObjects(toDelete);
  if (saved !== 'ok') return { ok: false, reason: saved };
  await setLongCache(accepted.flatMap((photo) => [photo.key, photo.thumbKey]));

  const room = await getOwnRoom(landlordId, roomId);
  const ids = new Set(accepted.map((photo) => photo.id));
  return { ok: true, photos: (room?.photos ?? []).filter((photo) => ids.has(photo.id)), problems };
}

/**
 * Adds the year-long Cache-Control to uploaded objects. Best effort: a photo
 * without it still works, it is only fetched more often.
 */
async function setLongCache(keys: string[]): Promise<void> {
  const results = await Promise.allSettled(keys.map((key) => r2.setHeaders(key, UPLOAD_CONTENT_TYPE, PHOTO_CACHE_CONTROL)));
  const failed = results.flatMap((result, index) => (result.status === 'rejected' ? [keys[index]] : []));
  if (failed.length > 0) console.error('[photos] could not set Cache-Control', failed, results.find((r) => r.status === 'rejected'));
}

/** Deletes objects, logging (not throwing) on failure: the orphan script catches leftovers. */
export async function removeObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const failed = await r2.deleteMany(keys);
    if (failed.length > 0) console.error('[photos] could not delete objects', failed);
  } catch (error) {
    console.error('[photos] could not delete objects', keys, error);
  }
}

/** Deletes a photo row and its objects. `undefined` when missing or not theirs. */
export async function removePhoto(landlordId: string, roomId: string, photoId: string) {
  const deleted = await deleteOwnRoomPhoto(landlordId, roomId, photoId);
  if (!deleted) return undefined;
  await removeObjects(deleted.keys);
  return { hidden: deleted.hidden };
}

/** Deletes a room and all its photo objects. `false` when missing or not theirs. */
export async function removeRoom(landlordId: string, roomId: string): Promise<boolean> {
  const keys = await deleteOwnRoom(landlordId, roomId);
  if (!keys) return false;
  await removeObjects(keys);
  return true;
}
