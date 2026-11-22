/**
 * Landlord-side room queries, bound to a DB by `createLandlordRooms(db)`.
 * App code imports the bound functions from `landlord-rooms.ts`; the ownership
 * test script (`scripts/test-ownership.ts`) binds its own DB. Keep this file
 * free of `astro:*` imports.
 *
 * Authorization lives here: every function takes the signed-in landlord's id
 * and puts `rooms.landlord_id = landlordId` in the SQL itself. A room owned by
 * someone else is indistinguishable from one that does not exist
 * (`undefined` / `not-found`), so callers answer 404, never 403.
 *
 * Rule: a room can be "available" only with at least one photo and once the
 * landlord has verified their email. Updates that set "available" are guarded
 * in SQL; deleting the last photo hides the room.
 */
import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Room, RoomStatus } from '../types';
import { ROOM_STATUSES } from '../types';
import type { Db } from './db/create-db';
import { toPlaceColumns, toRoom, toUtilityColumns } from './db/mappers';
import { contactRequests, roomPhotos, rooms, user, type RoomRow } from './db/schema';
import { PROVINCE } from './locations';
import { MAX_PHOTOS_PER_ROOM } from './photo-rules';
import { loadCovers, loadPhotos } from './room-photos-core';
import { slugify } from './slug';
import type { RoomInput } from './validation/room';

const owned = (landlordId: string, roomId: string) => and(eq(rooms.id, roomId), eq(rooms.landlordId, landlordId));

/** Set on the first switch to `available`, then kept (`Room.publishedAt`). */
const publishedAtFor = (status: RoomStatus) =>
  status === 'available' ? { publishedAt: sql`coalesce(${rooms.publishedAt}, now())` } : {};

/** `exists (a photo of this room)`, for updates on `rooms`. */
const hasPhotos = sql`exists (select 1 from ${roomPhotos} where ${roomPhotos.roomId} = ${rooms.id})`;

/** The owner has verified their email, for updates on `rooms`. */
const ownerVerified = sql`exists (select 1 from ${user} where ${user.id} = ${rooms.landlordId} and ${user.emailVerified})`;

/** Guard for updates that set "available": photos and a verified owner. */
const canPublish = and(hasPhotos, ownerVerified);

/** Columns written from the form. Province is fixed; photos are separate rows. */
function formColumns(input: RoomInput) {
  const { utilities, location, ...fields } = input;
  return {
    ...fields,
    ...toPlaceColumns(input),
    ...toUtilityColumns(utilities),
    lat: location?.lat ?? null,
    lng: location?.lng ?? null,
    province: PROVINCE,
  };
}

/** Readable, unique id for the public URL: `studio-ban-cong-xuan-dieu-3f9a1c2b`. */
function newRoomId(title: string): string {
  const base = slugify(title).slice(0, 60).replace(/-+$/, '') || 'phong';
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * `needs-photo`: the save would make a room without photos "available".
 * `needs-verification`: same, but the landlord's email is not verified yet.
 */
export type SaveResult = 'ok' | 'not-found' | 'needs-photo' | 'needs-verification';

export interface NewRoomPhoto {
  id: string;
  key: string;
  thumbKey: string;
  width: number;
  height: number;
}

export interface DeletedPhoto {
  /** Object keys to remove from storage. */
  keys: string[];
  /** The room was "available" and lost its last photo, so it is now hidden. */
  hidden: boolean;
}

export interface DashboardStats {
  rooms: Record<RoomStatus, number>;
  totalRooms: number;
  /** Contact requests with status `new` on the landlord's rooms. */
  newContactRequests: number;
}

export function createLandlordRooms(db: Db) {
  async function roomExists(landlordId: string, roomId: string): Promise<boolean> {
    const [row] = await db.select({ id: rooms.id }).from(rooms).where(owned(landlordId, roomId)).limit(1);
    return Boolean(row);
  }

  /** A guarded update matched no row: missing room, the photo rule, or an unverified email? */
  async function explainNoUpdate(landlordId: string, roomId: string): Promise<SaveResult> {
    const [row] = await db
      .select({ hasPhotos: sql<boolean>`${hasPhotos}` })
      .from(rooms)
      .where(owned(landlordId, roomId))
      .limit(1);
    if (!row) return 'not-found';
    return row.hasPhotos ? 'needs-verification' : 'needs-photo';
  }

  /** The landlord's rooms, most recently updated first, any status. `photos` holds only the cover. */
  async function listOwnRooms(landlordId: string): Promise<Room[]> {
    const rows = await db
      .select()
      .from(rooms)
      .where(eq(rooms.landlordId, landlordId))
      .orderBy(desc(rooms.updatedAt), desc(rooms.id));
    const covers = await loadCovers(db, rows.map((row) => row.id));
    return rows.map((row: RoomRow) => {
      const cover = covers.get(row.id);
      return toRoom(row, cover ? [cover] : []);
    });
  }

  /** One of the landlord's rooms with every photo; `undefined` if missing or not theirs. */
  async function getOwnRoom(landlordId: string, roomId: string): Promise<Room | undefined> {
    const [row] = await db.select().from(rooms).where(owned(landlordId, roomId)).limit(1);
    if (!row) return undefined;
    const photos = await loadPhotos(db, [row.id]);
    return toRoom(row, photos.get(row.id));
  }

  /** A new room has no photos, so it always starts hidden, whatever the form said. */
  async function createRoom(landlordId: string, input: RoomInput): Promise<Room> {
    const now = new Date();
    const [row] = await db
      .insert(rooms)
      .values({
        ...formColumns(input),
        status: 'hidden',
        id: newRoomId(input.title),
        landlordId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return toRoom(row!);
  }

  /** Saves the form fields. Refuses "available" for a room without photos. */
  async function updateOwnRoom(landlordId: string, roomId: string, input: RoomInput): Promise<SaveResult> {
    const updated = await db
      .update(rooms)
      .set({ ...formColumns(input), ...publishedAtFor(input.status), updatedAt: new Date() })
      .where(and(owned(landlordId, roomId), input.status === 'available' ? canPublish : undefined))
      .returning({ id: rooms.id });
    return updated.length > 0 ? 'ok' : explainNoUpdate(landlordId, roomId);
  }

  /** Refuses "available" for a room without photos. */
  async function setOwnRoomStatus(landlordId: string, roomId: string, status: RoomStatus): Promise<SaveResult> {
    const updated = await db
      .update(rooms)
      .set({ status, ...publishedAtFor(status), updatedAt: new Date() })
      .where(and(owned(landlordId, roomId), status === 'available' ? canPublish : undefined))
      .returning({ id: rooms.id });
    return updated.length > 0 ? 'ok' : explainNoUpdate(landlordId, roomId);
  }

  /**
   * Deletes the room; contact requests and photo rows cascade. Returns the
   * photo object keys to remove from storage, or `undefined` when the room is
   * missing or not theirs.
   */
  async function deleteOwnRoom(landlordId: string, roomId: string): Promise<string[] | undefined> {
    const photos = await db
      .select({ key: roomPhotos.key, thumbKey: roomPhotos.thumbKey })
      .from(roomPhotos)
      .innerJoin(rooms, eq(roomPhotos.roomId, rooms.id))
      .where(owned(landlordId, roomId));
    const deleted = await db.delete(rooms).where(owned(landlordId, roomId)).returning({ id: rooms.id });
    if (deleted.length === 0) return undefined;
    return photos.flatMap((photo) => [photo.key, photo.thumbKey]);
  }

  /** Photo count of one of the landlord's rooms; `undefined` if missing or not theirs. */
  async function countOwnRoomPhotos(landlordId: string, roomId: string): Promise<number | undefined> {
    // One statement: no row when the room is missing or not theirs.
    const [row] = await db
      .select({ count: count(roomPhotos.id) })
      .from(rooms)
      .leftJoin(roomPhotos, eq(roomPhotos.roomId, rooms.id))
      .where(owned(landlordId, roomId))
      .groupBy(rooms.id);
    return row?.count;
  }

  /**
   * Appends photos after the existing ones in one statement that also checks
   * ownership and the per-room limit. Idempotent: photos whose key is already
   * saved (a retried confirm) are skipped and count as saved, so the caller
   * never deletes the objects of a saved photo. (Two confirms racing could
   * both pass the count; the presign step limits that, and it is harmless.)
   */
  async function addOwnRoomPhotos(
    landlordId: string,
    roomId: string,
    photos: NewRoomPhoto[],
  ): Promise<'ok' | 'not-found' | 'limit'> {
    const unique = [...new Map(photos.map((photo) => [photo.key, photo])).values()];
    const saved = async () => {
      if (unique.length === 0) return new Set<string>();
      const rows = await db
        .select({ key: roomPhotos.key })
        .from(roomPhotos)
        .where(and(eq(roomPhotos.roomId, roomId), inArray(roomPhotos.key, unique.map((photo) => photo.key))));
      return new Set(rows.map((row) => row.key));
    };
    const already = await saved();
    const fresh = unique.filter((photo) => !already.has(photo.key));
    if (fresh.length === 0) return (await roomExists(landlordId, roomId)) ? 'ok' : 'not-found';

    const values = sql.join(
      fresh.map(
        (photo, index) =>
          sql`(${photo.id}, ${photo.key}, ${photo.thumbKey}, ${photo.width}::int, ${photo.height}::int, ${index}::int)`,
      ),
      sql`, `,
    );
    const inserted = await db.execute<{ id: string }>(sql`
      insert into ${roomPhotos} (id, room_id, key, thumb_key, width, height, sort_order)
      select v.id, ${roomId}, v.key, v.thumb_key, v.width, v.height,
             (select coalesce(max(sort_order) + 1, 0) from ${roomPhotos} where room_id = ${roomId}) + v.ord
      from (values ${values}) as v(id, key, thumb_key, width, height, ord)
      where exists (select 1 from ${rooms} where ${rooms.id} = ${roomId} and ${rooms.landlordId} = ${landlordId})
        and (select count(*) from ${roomPhotos} where room_id = ${roomId}) + ${fresh.length}::int <= ${MAX_PHOTOS_PER_ROOM}::int
      on conflict do nothing
      returning id`);
    // All inserted, or the missing ones were saved meanwhile by a concurrent confirm.
    if (
      inserted.rows.length === fresh.length ||
      ((await saved()).size === unique.length && (await roomExists(landlordId, roomId)))
    ) {
      await db.update(rooms).set({ updatedAt: new Date() }).where(owned(landlordId, roomId));
      return 'ok';
    }
    return (await roomExists(landlordId, roomId)) ? 'limit' : 'not-found';
  }

  /** Sets the order; `photoIds` must be exactly the room's photos. The first becomes the cover. */
  async function reorderOwnRoomPhotos(
    landlordId: string,
    roomId: string,
    photoIds: string[],
  ): Promise<'ok' | 'not-found' | 'mismatch'> {
    if (!(await roomExists(landlordId, roomId))) return 'not-found';
    const current = await db.select({ id: roomPhotos.id }).from(roomPhotos).where(eq(roomPhotos.roomId, roomId));
    const wanted = new Set(photoIds);
    const same =
      wanted.size === photoIds.length && current.length === photoIds.length && current.every((row) => wanted.has(row.id));
    if (!same) return 'mismatch';
    if (photoIds.length === 0) return 'ok';
    const order = sql.join(
      photoIds.map((id, index) => sql`when ${id} then ${index}::int`),
      sql` `,
    );
    await db.batch([
      db
        .update(roomPhotos)
        .set({ sortOrder: sql`case ${roomPhotos.id} ${order} end` })
        .where(
          and(
            eq(roomPhotos.roomId, roomId),
            inArray(roomPhotos.id, photoIds),
            // Ownership again in the write itself, not only in the check above.
            sql`exists (select 1 from ${rooms} where ${rooms.id} = ${roomId} and ${rooms.landlordId} = ${landlordId})`,
          ),
        ),
      db.update(rooms).set({ updatedAt: new Date() }).where(owned(landlordId, roomId)),
    ]);
    return 'ok';
  }

  /**
   * Deletes one photo row and returns its object keys. If it was the last
   * photo of an available room, the room is hidden in the same transaction.
   * `undefined` when the photo or room is missing or not theirs.
   */
  async function deleteOwnRoomPhoto(
    landlordId: string,
    roomId: string,
    photoId: string,
  ): Promise<DeletedPhoto | undefined> {
    const [deleted, hidden] = await db.batch([
      db
        .delete(roomPhotos)
        .where(
          and(
            eq(roomPhotos.id, photoId),
            eq(roomPhotos.roomId, roomId),
            sql`exists (select 1 from ${rooms} where ${rooms.id} = ${roomId} and ${rooms.landlordId} = ${landlordId})`,
          ),
        )
        .returning({ key: roomPhotos.key, thumbKey: roomPhotos.thumbKey }),
      db
        .update(rooms)
        .set({ status: 'hidden', updatedAt: new Date() })
        .where(and(owned(landlordId, roomId), eq(rooms.status, 'available'), sql`not ${hasPhotos}`))
        .returning({ id: rooms.id }),
    ]);
    const photo = deleted[0];
    if (!photo) return undefined;
    return { keys: [photo.key, photo.thumbKey], hidden: hidden.length > 0 };
  }

  /** Every photo object key of the landlord's rooms (read before deleting the account). */
  async function listOwnPhotoKeys(landlordId: string): Promise<string[]> {
    const rows = await db
      .select({ key: roomPhotos.key, thumbKey: roomPhotos.thumbKey })
      .from(roomPhotos)
      .innerJoin(rooms, eq(roomPhotos.roomId, rooms.id))
      .where(eq(rooms.landlordId, landlordId));
    return rows.flatMap((row) => [row.key, row.thumbKey]);
  }

  async function getDashboardStats(landlordId: string): Promise<DashboardStats> {
    const [byStatus, [requests]] = await Promise.all([
      db
        .select({ status: rooms.status, count: count() })
        .from(rooms)
        .where(eq(rooms.landlordId, landlordId))
        .groupBy(rooms.status),
      db
        .select({ count: count() })
        .from(contactRequests)
        .innerJoin(rooms, eq(contactRequests.roomId, rooms.id))
        .where(and(eq(rooms.landlordId, landlordId), eq(contactRequests.status, 'new'))),
    ]);
    const counts = Object.fromEntries(ROOM_STATUSES.map((status) => [status, 0])) as Record<RoomStatus, number>;
    for (const row of byStatus) counts[row.status] = row.count;
    return {
      rooms: counts,
      totalRooms: byStatus.reduce((sum, row) => sum + row.count, 0),
      newContactRequests: requests?.count ?? 0,
    };
  }

  return {
    listOwnRooms,
    getOwnRoom,
    createRoom,
    updateOwnRoom,
    setOwnRoomStatus,
    deleteOwnRoom,
    countOwnRoomPhotos,
    addOwnRoomPhotos,
    reorderOwnRoomPhotos,
    deleteOwnRoomPhoto,
    listOwnPhotoKeys,
    getDashboardStats,
  };
}

export type LandlordRooms = ReturnType<typeof createLandlordRooms>;
