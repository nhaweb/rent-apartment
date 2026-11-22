/**
 * Direct contact on `/phong/[id]`, besides the contact form:
 * - "Gọi điện": every `available` room (every landlord has a phone number);
 *   `/phong/[id]/goi` redirects to `tel:`.
 * - "Nhắn Zalo": only when the landlord has a Zalo number and opted in
 *   (`landlords.zalo_public_at`); `/phong/[id]/zalo` redirects to zalo.me.
 *
 * Numbers are read only by those redirect endpoints (rate limited per IP), so
 * they never appear in HTML, JSON-LD, meta tags or the sitemap. The page only
 * asks whether the Zalo button exists (`roomHasPublicZalo`).
 */
import { and, eq, isNotNull, type SQL } from 'drizzle-orm';
import { db } from './db/client';
import { landlords, rooms } from './db/schema';

export type DirectContactKind = 'phone' | 'zalo';

const availableRoom = (roomId: string) => and(eq(rooms.id, roomId), eq(rooms.status, 'available'));

const CONDITIONS: Record<DirectContactKind, (roomId: string) => SQL | undefined> = {
  phone: availableRoom,
  zalo: (roomId) => and(availableRoom(roomId), isNotNull(landlords.zalo), isNotNull(landlords.zaloPublicAt)),
};

export async function roomHasPublicZalo(roomId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .innerJoin(landlords, eq(landlords.id, rooms.landlordId))
    .where(CONDITIONS.zalo(roomId))
    .limit(1);
  return Boolean(row);
}

/** The number behind a direct-contact button, or `undefined` when the button would not show. */
export async function getDirectContactNumber(kind: DirectContactKind, roomId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ phone: landlords.phone, zalo: landlords.zalo })
    .from(rooms)
    .innerJoin(landlords, eq(landlords.id, rooms.landlordId))
    .where(CONDITIONS[kind](roomId))
    .limit(1);
  return (kind === 'phone' ? row?.phone : row?.zalo) ?? undefined;
}

/** Where the redirect sends the renter, for a number stored as `0xxxxxxxxx`. */
export function directContactUrl(kind: DirectContactKind, number: string): string {
  return kind === 'phone' ? `tel:+84${number.replace(/^0/, '')}` : `https://zalo.me/${encodeURIComponent(number)}`;
}

/** Room path of each redirect endpoint. */
export const directContactPath = (kind: DirectContactKind, roomId: string) =>
  `/phong/${encodeURIComponent(roomId)}/${kind === 'phone' ? 'goi' : 'zalo'}`;

/**
 * `/phong/[id]?lien-he=gioi-han`: a redirect was refused (hourly limit per IP);
 * the page shows a notice. One param for both kinds.
 */
export const DIRECT_CONTACT_LIMIT_PARAM = 'lien-he';
export const DIRECT_CONTACT_LIMIT_VALUE = 'gioi-han';
