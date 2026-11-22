/**
 * Room photo limits and object-key rules, shared by the browser uploader,
 * the photo actions, the seed and the cleanup script. No `astro:*` imports.
 */

export const MAX_PHOTOS_PER_ROOM = 10;

/** Originals larger than this are rejected before any processing. */
export const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;

/** Accepted inputs. Some browsers report HEIC with an empty type, so the extension also counts. */
export const ACCEPTED_INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export const ACCEPTED_INPUT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'] as const;
/** Value for `<input type="file" accept>`. */
export const ACCEPT_ATTRIBUTE = [...ACCEPTED_INPUT_TYPES, ...ACCEPTED_INPUT_EXTENSIONS].join(',');

/** Re-encoded output: WebP, long edge at most this many pixels. */
export const FULL_MAX_EDGE = 1600;
export const THUMB_MAX_EDGE = 600;
export const WEBP_QUALITY = 0.8;
export const UPLOAD_CONTENT_TYPE = 'image/webp';
/** Photo objects never change (a new photo gets a new key), so browsers and the CDN may keep them for a year. */
export const PHOTO_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Checked after upload (a presigned PUT cannot cap the size). */
export const MAX_FULL_BYTES = 4 * 1024 * 1024;
export const MAX_THUMB_BYTES = 1024 * 1024;

/** Presigned PUT URLs expire after this many seconds. */
export const PRESIGN_TTL_SECONDS = 300;

export const ROOM_PHOTO_PREFIX = 'rooms/';

/** `rooms/{roomId}/{uuid}.webp` and `rooms/{roomId}/{uuid}-thumb.webp`. */
export function photoKeys(roomId: string, uuid: string): { key: string; thumbKey: string } {
  const base = `${ROOM_PHOTO_PREFIX}${roomId}/${uuid}`;
  return { key: `${base}.webp`, thumbKey: `${base}-thumb.webp` };
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const KEY_PATTERN = new RegExp(`^${ROOM_PHOTO_PREFIX}([^/]+)/(${UUID})(-thumb)?\\.webp$`);

/** Parses a photo object key; `undefined` for anything that is not one. */
export function parsePhotoKey(key: string): { roomId: string; uuid: string; thumb: boolean } | undefined {
  const match = KEY_PATTERN.exec(key);
  if (!match) return undefined;
  return { roomId: match[1]!, uuid: match[2]!, thumb: Boolean(match[3]) };
}

/** Size that fits `width`×`height` inside a `maxEdge` square, never upscaled. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
