/**
 * The signed-in landlord's own profile. Name lives in both Better Auth's
 * `user` row and our `landlords` row, so both are written in one batch;
 * phone and Zalo are only in `landlords`. Email is not editable yet (it
 * would need verification).
 */
import { eq } from 'drizzle-orm';
import { db } from './db/client';
import { landlords, user } from './db/schema';
import type { UpdateProfileInput } from './validation/auth';

export async function updateLandlordProfile(landlordId: string, input: UpdateProfileInput): Promise<boolean> {
  const [updated] = await db.batch([
    db
      .update(landlords)
      .set({ name: input.name, phone: input.phone, zalo: input.zalo ?? null })
      .where(eq(landlords.id, landlordId))
      .returning({ id: landlords.id }),
    db.update(user).set({ name: input.name, updatedAt: new Date() }).where(eq(user.id, landlordId)),
  ]);
  return updated.length > 0;
}
