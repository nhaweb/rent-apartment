/**
 * The app's Better Auth instance, configured from `astro:env`.
 * Only `src/lib/` and the `/api/auth/[...all]` route may import this.
 */
import { PUBLIC_SITE_URL } from 'astro:env/client';
import {
  BETTER_AUTH_ALLOWED_HOSTS,
  BETTER_AUTH_SECRET,
  VERCEL_BRANCH_URL,
  VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_URL,
} from 'astro:env/server';
import { db } from '../db/client';
import { createAuth } from './create-auth';
import { sendResetPasswordEmail, sendVerificationEmail } from './email';

/**
 * Vercel sets these per deployment (host only, no scheme): the deployment's own
 * URL, its branch alias, and the project's production domain (`<project>.vercel.app`).
 */
const extraHosts = [VERCEL_URL, VERCEL_BRANCH_URL, VERCEL_PROJECT_PRODUCTION_URL, ...(BETTER_AUTH_ALLOWED_HOSTS ?? '').split(',')]
  .map((host) => host?.trim())
  .filter((host): host is string => Boolean(host));

export const auth = createAuth({
  db,
  secret: BETTER_AUTH_SECRET,
  // Canonical origin; also the fallback for requests on hosts that are not allowed.
  baseURL: PUBLIC_SITE_URL,
  extraHosts,
  // Vercel serves every host over HTTPS, whatever PUBLIC_SITE_URL says.
  forceHttps: Boolean(VERCEL_URL),
  production: import.meta.env.PROD,
  sendResetPasswordEmail,
  sendVerificationEmail,
});
