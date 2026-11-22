/**
 * Auth helpers for pages, actions and middleware. Pages never touch Better
 * Auth directly: they read `getCurrentLandlord(Astro)`.
 */
import type { AstroCookies } from 'astro';
import { eq } from 'drizzle-orm';
import type { Landlord } from '../../types';
import { db } from '../db/client';
import { landlords } from '../db/schema';
import { authRequestHeaders, callAuthEndpoint, forwardAuthCookies } from './request';
import { auth } from './server';

export { callAuthEndpoint, type AuthCallResult } from './request';
export { GENERIC_AUTH_ERROR } from './errors';
export { EMAIL_VERIFIED_CALLBACK } from './create-auth';

export { DASHBOARD_PATH, isProtectedPath, safeNextPath, SIGN_IN_PATH, SIGN_UP_PATH } from './paths';

interface AuthContext {
  request: Request;
  clientAddress: string;
  cookies: AstroCookies;
  locals: App.Locals;
}

export interface AuthState {
  userId: string;
  /** Id of the current session row (to tell it apart in the device list). */
  sessionId: string;
  /** Unverified landlords can create rooms but not make them "available". */
  emailVerified: boolean;
  landlord: Landlord;
}

async function findLandlord(id: string): Promise<Landlord | null> {
  const [row] = await db.select().from(landlords).where(eq(landlords.id, id)).limit(1);
  if (!row) return null;
  const { zalo, ...rest } = row;
  return zalo ? { ...rest, zalo } : rest;
}

async function resolveAuthState(context: AuthContext): Promise<AuthState | null> {
  // Skip the DB round trip for visitors without a session cookie.
  if (!context.request.headers.get('cookie')?.includes('session_token')) return null;
  try {
    const { headers, response: session } = await auth.api.getSession({
      headers: authRequestHeaders(context),
      returnHeaders: true,
    });
    // Session refresh or cleanup of a stale cookie.
    forwardAuthCookies(context.cookies, headers);
    if (!session) return null;
    // A user without a landlord row (failed sign-up) has no dashboard access.
    const landlord = await findLandlord(session.user.id);
    return landlord
      ? {
          userId: session.user.id,
          sessionId: session.session.id,
          emailVerified: session.user.emailVerified,
          landlord,
        }
      : null;
  } catch (error) {
    console.error('[auth] Session lookup failed', error);
    return null;
  }
}

/**
 * Session + landlord for this request, looked up once and cached in
 * `locals`. Public pages that never call this cost no DB query.
 */
export function getAuthState(context: AuthContext): Promise<AuthState | null> {
  context.locals.auth ??= resolveAuthState(context);
  return context.locals.auth;
}

/** The signed-in landlord, or null. Use from pages and actions. */
export async function getCurrentLandlord(context: AuthContext): Promise<Landlord | null> {
  return (await getAuthState(context))?.landlord ?? null;
}

/** Whether the landlord row for a user exists (checked right after sign-up). */
export async function landlordExists(userId: string): Promise<boolean> {
  return (await findLandlord(userId)) !== null;
}

/**
 * Ends the current session (cookie cleared on the response). Safe to call
 * without a session.
 */
export async function signOut(context: AuthContext): Promise<void> {
  await callAuthEndpoint(context, '/sign-out', {});
  resetAuthState(context);
}

/** Text fields of a submitted form, minus passwords, to refill it after an error. */
export async function submittedValues(request: Request): Promise<Record<string, string>> {
  if (request.method !== 'POST') return {};
  try {
    const form = await request.clone().formData();
    const values: Record<string, string> = {};
    for (const [key, value] of form) {
      if (typeof value === 'string' && !key.toLowerCase().includes('password')) values[key] = value;
    }
    return values;
  } catch {
    return {};
  }
}

/** Forgets the cached state, e.g. after sign-in or sign-out in an action. */
export function resetAuthState(context: Pick<AuthContext, 'locals'>): void {
  context.locals.auth = undefined;
}
