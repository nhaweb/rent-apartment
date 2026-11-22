/**
 * The signed-in landlord's own profile. Name lives in both Better Auth's
 * `user` row and our `landlords` row, so both are written in one batch;
 * phone and Zalo are only in `landlords`. Email is not editable yet (it
 * would need verification).
 *
 * `zaloPublic` (the "Nhắn Zalo" opt-in): unchecked or no number clears
 * `zalo_public_at`; checked keeps the first opt-in time while the number stays
 * the same, and records a new one when the number changes.
 */
import { eq, sql } from 'drizzle-orm';
import { db } from './db/client';
import { landlords, user } from './db/schema';
import type { UpdateProfileInput } from './validation/auth';

export async function updateLandlordProfile(landlordId: string, input: UpdateProfileInput): Promise<boolean> {
  const zalo = input.zalo ?? null;
  // In SET, column references read the row's values before the update.
  const zaloPublicAt =
    input.zaloPublic && zalo
      ? sql`case when ${landlords.zalo} = ${zalo} and ${landlords.zaloPublicAt} is not null then ${landlords.zaloPublicAt} else now() end`
      : null;
  const [updated] = await db.batch([
    db
      .update(landlords)
      .set({ name: input.name, phone: input.phone, zalo, zaloPublicAt })
      .where(eq(landlords.id, landlordId))
      .returning({ id: landlords.id }),
    db.update(user).set({ name: input.name, updatedAt: new Date() }).where(eq(user.id, landlordId)),
  ]);
  return updated.length > 0;
}
