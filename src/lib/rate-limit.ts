/**
 * Fixed one-hour window per subject, stored in Postgres (no in-memory state:
 * Vercel runs many instances). The key is a hash of the subject, never the
 * value itself. Scopes and their subjects:
 * - `chat`, `contact`, `phone`, `zalo`: client IP (chat assistant, renter contact form, "Gọi điện" and "Nhắn Zalo" redirects)
 * - `upload`: landlord id (presigned photo upload URLs, counted per URL)
 * Each scope has its own table with the same columns (`key`, `window_start`, `count`).
 */
import { BETTER_AUTH_SECRET } from 'astro:env/server';
import { sql } from 'drizzle-orm';
import { db } from './db/client';
import { chatRateLimits, contactRateLimits, phoneRateLimits, uploadRateLimits, zaloRateLimits } from './db/schema';

const LIMITS = {
  chat: chatRateLimits,
  contact: contactRateLimits,
  upload: uploadRateLimits,
  phone: phoneRateLimits,
  zalo: zaloRateLimits,
} as const;

export type RateLimitScope = keyof typeof LIMITS;

async function hashKey(scope: RateLimitScope, subject: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${scope}:${subject}:${BETTER_AUTH_SECRET}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Counts `amount` uses for `subject` in `scope`; `false` once `perHour` is used
 * up. An empty subject (unknown client IP) is refused rather than sharing one
 * bucket with every other unknown client.
 */
export async function takeHourlyQuota(
  scope: RateLimitScope,
  subject: string,
  perHour: number,
  amount = 1,
): Promise<boolean> {
  if (!subject) return false;
  const table = LIMITS[scope];
  const key = await hashKey(scope, subject);
  const expired = sql`${table.windowStart} < now() - interval '1 hour'`;
  const [row] = await db
    .insert(table)
    .values({ key, windowStart: sql`now()`, count: amount })
    .onConflictDoUpdate({
      target: table.key,
      set: {
        count: sql`case when ${expired} then ${amount} else ${table.count} + ${amount} end`,
        windowStart: sql`case when ${expired} then now() else ${table.windowStart} end`,
      },
    })
    .returning({ count: table.count });
  return (row?.count ?? amount) <= perHour;
}
