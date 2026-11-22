/**
 * Removes rows that only grow and are never read again:
 * - expired Better Auth `session` and `verification` rows,
 * - Better Auth `rate_limit` rows idle for more than a day,
 * - our hourly counters (`chat_`, `contact_`, `upload_rate_limits`) older than a day,
 * - Gmail daily send counts (`email_send_counts`) older than 7 days.
 *
 *   npm run db:cleanup                          # counts only, changes nothing
 *   npm run db:cleanup -- --delete              # deletes (test database)
 *   npm run db:cleanup -- --delete --production # deletes on the production database
 *
 * Nothing here is user data that is still valid, so running it on production
 * is safe, but it has to be asked for explicitly. Not scheduled; see README.
 */
import { lt, sql } from 'drizzle-orm';
import { createDb } from '../src/lib/db/create-db';
import {
  chatRateLimits,
  contactRateLimits,
  emailSendCounts,
  phoneRateLimits,
  rateLimit,
  session,
  uploadRateLimits,
  verification,
  zaloRateLimits,
} from '../src/lib/db/schema';
import { neonEndpointId, requireEnv } from './lib/env';

const args = new Set(process.argv.slice(2));
const doDelete = args.has('--delete');

const databaseUrl = requireEnv('DATABASE_URL');
const isProduction = neonEndpointId(databaseUrl) === neonEndpointId(requireEnv('PRODUCTION_DB_ENDPOINT'));
if (doDelete && isProduction && !args.has('--production')) {
  throw new Error('db:cleanup: DATABASE_URL is the production database. Add --production to delete there.');
}

const db = createDb(databaseUrl);
const now = new Date();
const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const targets = [
  { name: 'session (expired)', table: session, where: lt(session.expiresAt, now) },
  { name: 'verification (expired)', table: verification, where: lt(verification.expiresAt, now) },
  { name: 'rate_limit (idle > 1 day)', table: rateLimit, where: lt(rateLimit.lastRequest, dayAgo.getTime()) },
  { name: 'chat_rate_limits (> 1 day)', table: chatRateLimits, where: lt(chatRateLimits.windowStart, dayAgo) },
  { name: 'contact_rate_limits (> 1 day)', table: contactRateLimits, where: lt(contactRateLimits.windowStart, dayAgo) },
  { name: 'upload_rate_limits (> 1 day)', table: uploadRateLimits, where: lt(uploadRateLimits.windowStart, dayAgo) },
  { name: 'phone_rate_limits (> 1 day)', table: phoneRateLimits, where: lt(phoneRateLimits.windowStart, dayAgo) },
  { name: 'zalo_rate_limits (> 1 day)', table: zaloRateLimits, where: lt(zaloRateLimits.windowStart, dayAgo) },
  { name: 'email_send_counts (> 7 days)', table: emailSendCounts, where: lt(emailSendCounts.day, weekAgo) },
] as const;

console.log(`db:cleanup on ${isProduction ? 'PRODUCTION' : 'test'} database (${doDelete ? 'deleting' : 'dry run'})`);
for (const target of targets) {
  if (doDelete) {
    const deleted = await db.delete(target.table).where(target.where).returning({ one: sql`1` });
    console.log(`  ${target.name}: deleted ${deleted.length}`);
  } else {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(target.table).where(target.where);
    console.log(`  ${target.name}: ${row?.count ?? 0}`);
  }
}
if (!doDelete) console.log('Dry run. Add -- --delete to remove these rows.');
