/**
 * Better Auth instance factory. Free of `astro:*` imports so the Better Auth
 * CLI (`auth.cli.ts`) can load it; the app instance lives in `./server.ts`.
 *
 * Landlords sign up with email + password. `phone` and `zalo` arrive in the
 * sign-up body; the user hooks validate them and create the matching
 * `landlords` row (landlords.id = user.id).
 */
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/create-db';
import * as schema from '../db/schema';
import { landlordProfileSchema, nameSchema, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../validation/auth';

export interface ResetPasswordEmail {
  to: string;
  name: string;
  url: string;
}

export interface CreateAuthOptions {
  db: Db;
  secret: string;
  /** Canonical origin (`PUBLIC_SITE_URL`). */
  baseURL: string;
  /** Other hosts this deployment answers on (Vercel preview URLs). */
  extraHosts?: string[];
  production: boolean;
  sendResetPasswordEmail: (email: ResetPasswordEmail) => Promise<void>;
  sendVerificationEmail: (email: ResetPasswordEmail) => Promise<void>;
}

/** Error code thrown when the sign-up body has no valid landlord profile. */
export const INVALID_LANDLORD_PROFILE = 'INVALID_LANDLORD_PROFILE';

/** Where the email verification link lands (Better Auth adds `&error=…` on failure). */
export const EMAIL_VERIFIED_CALLBACK = '/quan-ly?xac-thuc=ok';

/**
 * Used: sign-up/sign-in (email), sign-out, get-session, request-password-reset,
 * reset-password (+ its `/reset-password/:token` link), change-password
 * (`/quan-ly/tai-khoan`), send-verification-email + verify-email (link in
 * the email), delete-user (password required by our action; `/quan-ly/tai-khoan`).
 * Everything else is off. Profile fields (name, phone, Zalo) are saved by our
 * own action, which updates `user` and `landlords` together. The device list
 * and sign-out of other devices are our own queries on `session`, scoped by
 * user id (`src/lib/landlord-sessions.ts`), so session tokens never reach a page.
 */
const DISABLED_AUTH_PATHS = [
  '/update-user',
  '/change-email',
  '/set-password',
  '/delete-user/callback',
  '/list-sessions',
  '/revoke-session',
  '/revoke-sessions',
  '/revoke-other-sessions',
  '/list-accounts',
  '/unlink-account',
  '/link-social',
  '/sign-in/social',
  '/refresh-token',
  '/get-access-token',
  '/account-info',
  '/update-session',
];

/** Per-IP limits, stored in the `rate_limit` table (CLAUDE.md portability). */
const RATE_LIMIT_RULES = {
  '/sign-in/email': { window: 60, max: 5 },
  '/sign-up/email': { window: 600, max: 3 },
  '/request-password-reset': { window: 600, max: 3 },
  '/reset-password': { window: 600, max: 5 },
  '/change-password': { window: 600, max: 5 },
  '/send-verification-email': { window: 600, max: 3 },
  '/verify-email': { window: 600, max: 10 },
  '/delete-user': { window: 600, max: 5 },
} as const;

/** Reads the landlord profile from the sign-up request body. */
function parseProfile(body: unknown) {
  const { phone, zalo } = (body ?? {}) as Record<string, unknown>;
  return landlordProfileSchema.safeParse({ phone, zalo: zalo ?? '' });
}

export function createAuth({
  db,
  secret,
  baseURL,
  extraHosts = [],
  production,
  sendResetPasswordEmail,
  sendVerificationEmail,
}: CreateAuthOptions) {
  const canonical = new URL(baseURL);

  return betterAuth({
    secret,
    // Dynamic base URL: answer on the canonical host and on each allowed
    // preview host; anything else falls back to the canonical URL. The
    // protocol comes from the canonical URL because the app sits behind a
    // TLS-terminating proxy on both platforms.
    baseURL: {
      allowedHosts: [...new Set([canonical.host, ...extraHosts])],
      protocol: canonical.protocol === 'https:' ? 'https' : 'http',
      fallback: canonical.origin,
    },
    // HTTP endpoints the app does not use. Profile edits would change
    // `user.*` without `landlords.*` (name, email), so they stay closed until
    // the dashboard offers them. Server-side `auth.api.*` calls are unaffected.
    disabledPaths: DISABLED_AUTH_PATHS,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema,
      // Neon's HTTP driver has no interactive transactions.
      transaction: false,
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      revokeSessionsOnPasswordReset: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      sendResetPassword: async ({ user, url }) => {
        await sendResetPasswordEmail({ to: user.email, name: user.name, url });
      },
    },
    // Unverified landlords can sign in and create rooms, but not make one
    // "available" (guarded in SQL in `landlord-rooms-core.ts`).
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: 24 * 60 * 60,
      sendVerificationEmail: async ({ user, url }) => {
        await sendVerificationEmail({ to: user.email, name: user.name, url });
      },
    },
    // `/delete-user`: rows of `landlords`, `rooms`, `room_photos` and
    // `contact_requests` cascade from `user`. The action removes R2 objects.
    user: {
      deleteUser: { enabled: true },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: RATE_LIMIT_RULES,
    },
    advanced: {
      useSecureCookies: production,
      // Callers put the real client IP here (see `./request.ts` and the
      // handler route); never trust what the browser sent.
      ipAddress: { ipAddressHeaders: ['x-forwarded-for'] },
    },
    databaseHooks: {
      user: {
        create: {
          // Reject before anything is written if the profile is invalid.
          before: async (user, ctx) => {
            // The public `/api/auth/sign-up/email` route skips the sign-up
            // action's zod schema, so check the name here too.
            const name = nameSchema.safeParse(user.name);
            if (!name.success) {
              throw new APIError('BAD_REQUEST', {
                code: INVALID_LANDLORD_PROFILE,
                message: name.error.issues[0]?.message ?? 'Họ tên không hợp lệ',
              });
            }
            const profile = parseProfile(ctx?.body);
            if (!profile.success) {
              throw new APIError('BAD_REQUEST', {
                code: INVALID_LANDLORD_PROFILE,
                message: profile.error.issues[0]?.message ?? 'Thông tin chủ phòng không hợp lệ',
              });
            }
          },
          // Better Auth runs this after the sign-up endpoint has written the
          // user, account and session. A failure here is only logged by
          // Better Auth, so undo the sign-up ourselves; the sign-up action
          // then sees no landlord and reports an error.
          after: async (user, ctx) => {
            const profile = parseProfile(ctx?.body);
            try {
              if (!profile.success) throw profile.error;
              await db.insert(schema.landlords).values({
                id: user.id,
                name: user.name,
                email: user.email,
                phone: profile.data.phone,
                zalo: profile.data.zalo ?? null,
              });
            } catch (error) {
              console.error('[auth] Failed to create landlord row, removing user', user.id, error);
              // Cascades to account and session.
              await db.delete(schema.user).where(eq(schema.user.id, user.id));
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
