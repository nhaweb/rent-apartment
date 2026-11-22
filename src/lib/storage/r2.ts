/**
 * The app's R2 bucket, configured from `astro:env`. Only `src/lib/` imports
 * this. Scripts outside Astro use `createR2` from `./r2-core.ts`.
 */
import { R2_ACCESS_KEY_ID, R2_ACCOUNT_ID, R2_BUCKET, R2_SECRET_ACCESS_KEY } from 'astro:env/server';
import { createR2 } from './r2-core';

export const r2 = createR2({
  accountId: R2_ACCOUNT_ID,
  accessKeyId: R2_ACCESS_KEY_ID,
  secretAccessKey: R2_SECRET_ACCESS_KEY,
  bucket: R2_BUCKET,
});
