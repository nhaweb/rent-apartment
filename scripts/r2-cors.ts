/**
 * The CORS rule R2_BUCKET needs for direct browser uploads: PUT with a
 * Content-Type header from PUBLIC_SITE_URL (plus R2_CORS_EXTRA_ORIGINS).
 * Images are shown with plain <img>, which needs no CORS.
 *
 *   npm run r2:cors              # print the JSON for the Cloudflare dashboard
 *   npm run r2:cors -- --apply   # set it through the S3 API (token needs bucket admin rights)
 */
import type { CorsRule } from '../src/lib/storage/r2-core';
import { r2FromEnv, requireEnv } from './lib/env';

const origins = [requireEnv('PUBLIC_SITE_URL'), ...(process.env.R2_CORS_EXTRA_ORIGINS ?? '').split(',')]
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map((origin) => new URL(origin).origin);

const rule: CorsRule = {
  allowedOrigins: [...new Set(origins)],
  allowedMethods: ['PUT'],
  allowedHeaders: ['content-type'],
  exposeHeaders: ['ETag'],
  maxAgeSeconds: 3600,
};

// Cloudflare dashboard format (R2 > bucket > Settings > CORS policy).
console.log(
  JSON.stringify(
    [
      {
        AllowedOrigins: rule.allowedOrigins,
        AllowedMethods: rule.allowedMethods,
        AllowedHeaders: rule.allowedHeaders,
        ExposeHeaders: rule.exposeHeaders,
        MaxAgeSeconds: rule.maxAgeSeconds,
      },
    ],
    null,
    2,
  ),
);

if (process.argv.includes('--apply')) {
  const r2 = r2FromEnv();
  await r2.putCors([rule]);
  console.log(`Applied to bucket ${r2.bucket}.`);
}
