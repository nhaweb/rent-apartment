/**
 * Better Auth instance for the Better Auth CLI only (schema generation):
 *
 *   npx auth@1.7.26 generate --config auth.cli.ts --output src/lib/db/auth-schema.ts
 *
 * The app uses `src/lib/auth/server.ts`, which reads `astro:env`; the CLI
 * cannot load that, so this file builds the same config from placeholders.
 * No database connection is made.
 */
import { createAuth } from './src/lib/auth/create-auth';
import { createDb } from './src/lib/db/create-db';

export const auth = createAuth({
  db: createDb('postgresql://cli:cli@cli.invalid/cli'),
  secret: 'cli-only-placeholder-secret-not-used-at-runtime',
  baseURL: process.env.PUBLIC_SITE_URL ?? 'https://cli.invalid',
  production: false,
  sendResetPasswordEmail: async () => {},
  sendVerificationEmail: async () => {},
});
