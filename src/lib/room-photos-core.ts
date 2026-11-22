/**
 * Reading room photos (`room_photos`), bound to a DB. Shared by the public
 * queries (`rooms.ts`) and the landlord queries (`landlord-rooms-core.ts`).
 * No `astro:*` imports.
 */
import { asc, inArray } from 'drizzle-orm';
import type { RoomPhoto } from '../types';
import type { Db } from './db/create-db';
import { roomPhotos, type RoomPhotoRow } from './db/schema';

export function toRoomPhoto(row: Pick<RoomPhotoRow, 'id' | 'key' | 'thumbKey' | 'width' | 'height' | 'sortOrder'>): RoomPhoto {
  return { id: row.id, key: row.key, thumbKey: row.thumbKey, width: row.width, height: row.height, sortOrder: row.sortOrder };
}

const photoColumns = {
  roomId: roomPhotos.roomId,
  id: roomPhotos.id,
  key: roomPhotos.key,
  thumbKey: roomPhotos.thumbKey,
  width: roomPhotos.width,
  height: roomPhotos.height,
  sortOrder: roomPhotos.sortOrder,
};

/** Every photo of each room, in display order. Rooms without photos map to `[]`. */
export async function loadPhotos(db: Db, roomIds: string[]): Promise<Map<string, RoomPhoto[]>> {
  const byRoom = new Map<string, RoomPhoto[]>(roomIds.map((id) => [id, []]));
  if (roomIds.length === 0) return byRoom;
  const rows = await db
    .select(photoColumns)
    .from(roomPhotos)
    .where(inArray(roomPhotos.roomId, [...new Set(roomIds)]))
    .orderBy(asc(roomPhotos.roomId), asc(roomPhotos.sortOrder), asc(roomPhotos.createdAt));
  for (const row of rows) byRoom.get(row.roomId)?.push(toRoomPhoto(row));
  return byRoom;
}

/** Only the cover (first photo) of each room; rooms without photos are absent. */
export async function loadCovers(db: Db, roomIds: string[]): Promise<Map<string, RoomPhoto>> {
  const covers = new Map<string, RoomPhoto>();
  if (roomIds.length === 0) return covers;
  const rows = await db
    .selectDistinctOn([roomPhotos.roomId], photoColumns)
    .from(roomPhotos)
    .where(inArray(roomPhotos.roomId, [...new Set(roomIds)]))
    .orderBy(asc(roomPhotos.roomId), asc(roomPhotos.sortOrder), asc(roomPhotos.createdAt));
  for (const row of rows) covers.set(row.roomId, toRoomPhoto(row));
  return covers;
}
