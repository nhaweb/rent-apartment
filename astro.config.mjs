// @ts-check
import { defineConfig, envField } from 'astro/config';
import { loadEnv } from 'vite';

import tailwindcss from '@tailwindcss/vite';

import node from '@astrojs/node';
import vercel from '@astrojs/vercel';

import react from '@astrojs/react';

/**
 * Adapter per deploy target (CLAUDE.md "Deploy"): `node` (Fly.io, default)
 * or `vercel` (test / preview). Read at build time. Vercel sets `VERCEL=1` in
 * its builds, so the Vercel adapter is picked there even without DEPLOY_TARGET
 * (with the node adapter Vercel finds no output and answers 404 NOT_FOUND).
 */
const deployTarget = process.env.DEPLOY_TARGET || (process.env.VERCEL ? 'vercel' : 'node');
if (deployTarget !== 'node' && deployTarget !== 'vercel') {
  throw new Error(`DEPLOY_TARGET must be "node" or "vercel", got "${deployTarget}".`);
}

/**
 * Canonical origin for `Astro.site` (canonical links, og:url, sitemap). Same
 * value as the `PUBLIC_SITE_URL` env field, read here from the environment or
 * `.env` because the config is evaluated before `astro:env` exists.
 */
const siteUrl =
  process.env.PUBLIC_SITE_URL ||
  loadEnv(process.env.NODE_ENV === 'production' ? 'production' : 'development', process.cwd(), 'PUBLIC_').PUBLIC_SITE_URL ||
  undefined;

// https://astro.build/config
export default defineConfig({
  site: siteUrl,

  // Every page renders on demand: listings read filters from the query string,
  // and room data will come from a live backend.
  output: 'server',

  // CSRF: form posts (Astro Actions, `POST /dang-xuat`) must come from our own
  // origin. This is Astro's default; stated so it is never turned off by accident.
  security: { checkOrigin: true },

  env: {
    schema: {
      // Canonical public origin of this deployment, e.g. https://tenmien.vn or
      // http://localhost:4321. Better Auth's base URL; inlined at build time.
      PUBLIC_SITE_URL: envField.string({ context: 'client', access: 'public', url: true }),

      // Neon Postgres. Read at runtime only, so builds do not need it.
      DATABASE_URL: envField.string({ context: 'server', access: 'secret' }),

      // --- Room photos: Cloudflare R2 through the S3 API (one bucket per environment) ---
      R2_ACCOUNT_ID: envField.string({ context: 'server', access: 'secret' }),
      R2_ACCESS_KEY_ID: envField.string({ context: 'server', access: 'secret' }),
      R2_SECRET_ACCESS_KEY: envField.string({ context: 'server', access: 'secret' }),
      R2_BUCKET: envField.string({ context: 'server', access: 'secret' }),
      // Public base URL that serves the bucket (r2.dev or a custom domain), no
      // trailing slash. Photo URLs are `${PUBLIC_IMAGE_BASE_URL}/${key}`.
      PUBLIC_IMAGE_BASE_URL: envField.string({ context: 'client', access: 'public', url: true }),
      // MapLibre style for /ban-do. OpenFreeMap's public style needs no key;
      // point this at a self-hosted style to move off the shared servers.
      PUBLIC_MAP_STYLE_URL: envField.string({
        context: 'client',
        access: 'public',
        default: 'https://tiles.openfreemap.org/styles/liberty',
      }),

      // Let search engines crawl this deployment (robots.txt). Only production
      // sets it; local, test and preview deployments answer "Disallow: /".
      ALLOW_INDEXING: envField.boolean({ context: 'server', access: 'public', default: false }),

      // --- Auth (Better Auth, landlords only) ---
      BETTER_AUTH_SECRET: envField.string({ context: 'server', access: 'secret', min: 32 }),
      // Extra hosts allowed to serve auth, comma separated (e.g. a custom
      // preview domain). Vercel's VERCEL_URL / VERCEL_BRANCH_URL /
      // VERCEL_PROJECT_PRODUCTION_URL are added
      // automatically.
      BETTER_AUTH_ALLOWED_HOSTS: envField.string({ context: 'server', access: 'secret', optional: true }),
      VERCEL_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      VERCEL_BRANCH_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      VERCEL_PROJECT_PRODUCTION_URL: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Header that carries the real client IP for rate limiting. Set
      // `fly-client-ip` on Fly.io. Unset: Astro's clientAddress (correct on
      // Vercel and in local dev).
      CLIENT_IP_HEADER: envField.string({ context: 'server', access: 'secret', optional: true }),

      // --- Email (password reset, verification, contact requests): src/lib/email.ts ---
      // console (default: prints links in dev, sends nothing in production) | gmail | resend
      EMAIL_TRANSPORT: envField.enum({
        context: 'server',
        access: 'secret',
        values: ['console', 'gmail', 'resend'],
        optional: true,
      }),
      // Temporary, until we have a domain. GMAIL_APP_PASSWORD is a 16-character App Password.
      GMAIL_USER: envField.string({ context: 'server', access: 'secret', optional: true }),
      GMAIL_APP_PASSWORD: envField.string({ context: 'server', access: 'secret', optional: true }),
      RESEND_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      EMAIL_FROM: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Public address for privacy / data requests, shown on /chinh-sach-bao-mat and /dieu-khoan.
      CONTACT_EMAIL: envField.string({ context: 'server', access: 'public', optional: true }),

      // --- Chat assistant (Gemini). Without a key the chat button is hidden. ---
      GEMINI_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
      // Flash-Lite: ~1s per turn; gemini-3.6-flash took ~10s and 3.8-flash often timed out (Nov 2026).
      GEMINI_MODEL: envField.string({ context: 'server', access: 'secret', default: 'gemini-3.5-flash-lite' }),
      // Used when GEMINI_MODEL is overloaded (503/429) or times out.
      GEMINI_FALLBACK_MODEL: envField.string({ context: 'server', access: 'secret', default: 'gemini-3.6-flash' }),
      // Messages per client IP per hour.
      CHAT_RATE_LIMIT_PER_HOUR: envField.number({ context: 'server', access: 'secret', default: 20, int: true, gt: 0 }),

      // --- Renter contact form ---
      // Requests per client IP per hour (all rooms together).
      CONTACT_RATE_LIMIT_PER_HOUR: envField.number({ context: 'server', access: 'secret', default: 5, int: true, gt: 0 }),
    },
  },

  // React only for the few interactive islands (React Bits components).
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()],
    // @jsquash/webp loads its .wasm via `new URL(..., import.meta.url)`, which
    // breaks if Vite pre-bundles it in dev.
    optimizeDeps: { exclude: ['@jsquash/webp'] },
  },

  adapter: deployTarget === 'vercel' ? vercel() : node({ mode: 'standalone' }),
});
