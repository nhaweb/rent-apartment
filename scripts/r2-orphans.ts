/**
 * Finds room photo objects in R2_BUCKET that no `room_photos` row points at
 * and that are older than 24 hours (younger ones may be uploads in progress).
 * They come from abandoned uploads or failed deletes.
 *
 *   npm run r2:orphans            # list only (default)
 *   npm run r2:orphans -- --delete
 *
 * Not scheduled yet. Uses DATABASE_URL and the R2_* variables from `.env`.
 * `--delete` refuses unless both are production or both are not
 * (needs PRODUCTION_DB_ENDPOINT and PRODUCTION_R2_BUCKET).
 */
import { createDb } from '../src/lib/db/create-db';
import { roomPhotos } from '../src/lib/db/schema';
import { ROOM_PHOTO_PREFIX } from '../src/lib/photo-rules';
import { assertSameEnvironment, r2FromEnv, requireEnv } from './lib/env';

const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const shouldDelete = process.argv.includes('--delete');
if (shouldDelete) assertSameEnvironment('r2:orphans --delete');

const db = createDb(requireEnv('DATABASE_URL'));
const r2 = r2FromEnv();

// List objects first: a photo saved after this listing is then never treated as an orphan.
const objects = await r2.list(ROOM_PHOTO_PREFIX);
const rows = await db.select({ key: roomPhotos.key, thumbKey: roomPhotos.thumbKey }).from(roomPhotos);
const known = new Set(rows.flatMap((row) => [row.key, row.thumbKey]));
const cutoff = Date.now() - MIN_AGE_MS;

const orphans = objects.filter((object) => !known.has(object.key) && object.lastModified.getTime() < cutoff);
const recent = objects.filter((object) => !known.has(object.key) && object.lastModified.getTime() >= cutoff).length;

console.log(`Bucket ${r2.bucket}: ${objects.length} objects under ${ROOM_PHOTO_PREFIX}, ${known.size} referenced.`);
for (const object of orphans) {
  console.log(`  orphan  ${object.key}  ${(object.size / 1024).toFixed(0)} KB  ${object.lastModified.toISOString()}`);
}
console.log(`${orphans.length} orphan(s) older than 24h${recent ? `, ${recent} newer unreferenced object(s) skipped` : ''}.`);

if (shouldDelete && orphans.length > 0) {
  const failed = await r2.deleteMany(orphans.map((object) => object.key));
  console.log(`Deleted ${orphans.length - failed.length}.${failed.length ? ` Failed: ${failed.join(', ')}` : ''}`);
  if (failed.length) process.exit(1);
} else if (orphans.length > 0) {
  console.log('Dry run. Re-run with `-- --delete` to remove them.');
}
