/**
 * Seeds the database with the mock rooms from `src/lib/mock/rooms.ts` and
 * placeholder landlords for every `landlordId` they reference. Each landlord
 * gets a Better Auth user (same id) and a credential account whose password
 * is `SEED_PASSWORD`, so you can sign in as `landlord-01@example.test`.
 *
 * Room photos: the bundled files in `src/assets/rooms/` are resized like the
 * browser uploader does (WebP, 1600px + 600px thumbnail, no metadata),
 * uploaded to R2_BUCKET under deterministic keys, and saved as `room_photos`.
 *
 * Idempotent: rows are upserted by id, existing objects are not re-uploaded.
 * Run with `npm run db:seed`. Refuses to run against the production database
 * or bucket (PRODUCTION_DB_ENDPOINT / PRODUCTION_R2_BUCKET).
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { hashPassword } from 'better-auth/crypto';
import { getTableColumns, inArray, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import sharp from 'sharp';
import { createDb } from '../src/lib/db/create-db';
import { toRoomRow } from '../src/lib/db/mappers';
import { account, landlords, roomPhotos, rooms, user } from '../src/lib/db/schema';
import { MOCK_ROOM_PHOTO_FILES, MOCK_ROOMS } from '../src/lib/mock/rooms';
import { FULL_MAX_EDGE, PHOTO_CACHE_CONTROL, photoKeys, THUMB_MAX_EDGE, UPLOAD_CONTENT_TYPE, WEBP_QUALITY } from '../src/lib/photo-rules';
import type { Landlord } from '../src/types';
import { assertNotProduction, r2FromEnv, requireEnv } from './lib/env';

assertNotProduction('db:seed');
const url = requireEnv('DATABASE_URL');
const r2 = r2FromEnv();

const seedPassword = process.env.SEED_PASSWORD;
if (!seedPassword || seedPassword.length < 8) {
  throw new Error('SEED_PASSWORD is not set (at least 8 characters). See .env.example.');
}

/** `SET col = excluded.col` for every column except the primary key. */
function excludedSet<T extends PgTable>(table: T): Record<string, SQL> {
  const set: Record<string, SQL> = {};
  for (const [key, column] of Object.entries(getTableColumns(table))) {
    if (!column.primary) set[key] = sql.raw(`excluded."${column.name}"`);
  }
  return set;
}

const landlordIds = [...new Set(MOCK_ROOMS.map((room) => room.landlordId))].sort();

const mockLandlords: Landlord[] = landlordIds.map((id, index) => {
  const n = String(index + 1).padStart(2, '0');
  return {
    id,
    name: `Chủ phòng ${n}`,
    phone: `09050000${n}`,
    email: `landlord-${n}@example.test`,
  };
});

const now = new Date();
const passwordHash = await hashPassword(seedPassword);

const userRows = mockLandlords.map((landlord) => ({
  id: landlord.id,
  name: landlord.name,
  email: landlord.email,
  // Seeded landlords have available rooms, which requires a verified email.
  emailVerified: true,
  createdAt: now,
  updatedAt: now,
}));

// Same shape Better Auth writes on sign-up: providerId `credential`,
// accountId = user id. Deterministic ids keep the seed idempotent.
const accountRows = mockLandlords.map((landlord) => ({
  id: `seed-credential-${landlord.id}`,
  accountId: landlord.id,
  providerId: 'credential',
  userId: landlord.id,
  password: passwordHash,
  createdAt: now,
  updatedAt: now,
}));

const db = createDb(url);

// Order matters: landlords.id references user.id.
await db.batch([
  db.insert(user).values(userRows).onConflictDoUpdate({ target: user.id, set: excludedSet(user) }),
  db.insert(account).values(accountRows).onConflictDoUpdate({ target: account.id, set: excludedSet(account) }),
  db.insert(landlords).values(mockLandlords).onConflictDoUpdate({ target: landlords.id, set: excludedSet(landlords) }),
  db
    .insert(rooms)
    .values(MOCK_ROOMS.map(toRoomRow))
    .onConflictDoUpdate({ target: rooms.id, set: excludedSet(rooms) }),
]);

// ------------------------------------------------------------ photos

/** Stable UUID (v5 layout) per room + file, so re-seeding reuses the same keys. */
function seedUuid(roomId: string, file: string): string {
  const hex = createHash('sha256').update(`seed-photo:${roomId}:${file}`).digest('hex');
  const variant = ((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function webp(input: Buffer, maxEdge: number) {
  // sharp drops EXIF/XMP unless asked to keep it.
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: Math.round(WEBP_QUALITY * 100) })
    .toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height };
}

const photoRows: (typeof roomPhotos.$inferInsert)[] = [];
let uploaded = 0;
for (const room of MOCK_ROOMS) {
  const files = MOCK_ROOM_PHOTO_FILES[room.id] ?? [];
  for (const [index, file] of files.entries()) {
    const uuid = seedUuid(room.id, file);
    const keys = photoKeys(room.id, uuid);
    const source = await readFile(`src/assets/rooms/${file}.webp`);
    const [full, thumb] = await Promise.all([webp(source, FULL_MAX_EDGE), webp(source, THUMB_MAX_EDGE)]);
    for (const [key, image] of [
      [keys.key, full],
      [keys.thumbKey, thumb],
    ] as const) {
      if (await r2.head(key)) continue;
      await r2.put(key, image.data, UPLOAD_CONTENT_TYPE, PHOTO_CACHE_CONTROL);
      uploaded++;
    }
    photoRows.push({ id: uuid, roomId: room.id, ...keys, width: full.width, height: full.height, sortOrder: index, createdAt: now });
  }
}

// Replace the seeded rooms' photo rows (objects for removed rows are left to `npm run r2:orphans`).
await db.batch([
  db.delete(roomPhotos).where(inArray(roomPhotos.roomId, MOCK_ROOMS.map((room) => room.id))),
  db.insert(roomPhotos).values(photoRows),
]);

console.log(
  `Seeded ${mockLandlords.length} landlords (users landlord-01..${String(mockLandlords.length).padStart(2, '0')}@example.test) and ${MOCK_ROOMS.length} rooms with ${photoRows.length} photos (${uploaded} objects uploaded to ${r2.bucket}).`,
);
