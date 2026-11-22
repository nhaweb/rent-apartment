/**
 * Calls Better Auth endpoints the way a browser would, through
 * `auth.handler`. Server-side `auth.api.*` calls skip Better Auth's rate
 * limiter, so the form actions go through here instead.
 */
import type { AstroCookies } from 'astro';
import { CLIENT_IP_HEADER } from 'astro:env/server';
import { parseSetCookieHeader, toCookieOptions } from 'better-auth/cookies';
import { authErrorMessage } from './errors';
import { auth } from './server';

/** The parts of Astro's APIContext / ActionAPIContext used here. */
export interface AuthRequestContext {
  request: Request;
  clientAddress: string;
  cookies: AstroCookies;
}

/**
 * Real client IP. On Fly.io set `CLIENT_IP_HEADER=fly-client-ip` (set by
 * Fly's proxy, not spoofable). Otherwise Astro's clientAddress, which the
 * Vercel adapter derives from Vercel's own forwarding header.
 */
export function clientIp(context: Pick<AuthRequestContext, 'request' | 'clientAddress'>): string {
  const fromHeader = CLIENT_IP_HEADER && context.request.headers.get(CLIENT_IP_HEADER);
  if (fromHeader) return fromHeader.split(',')[0]!.trim();
  warnIfBehindFlyProxy(context.request);
  try {
    return context.clientAddress;
  } catch {
    return '';
  }
}

let warnedFly = false;

/**
 * Behind Fly's proxy, `clientAddress` is the proxy, so every visitor would
 * share one rate-limit bucket. Fly always sets `fly-client-ip`; if it shows up
 * while `CLIENT_IP_HEADER` is unset, say so once in the logs.
 */
function warnIfBehindFlyProxy(request: Request): void {
  if (warnedFly || CLIENT_IP_HEADER || !request.headers.has('fly-client-ip')) return;
  warnedFly = true;
  console.warn('[client-ip] Running behind Fly.io but CLIENT_IP_HEADER is not set; set CLIENT_IP_HEADER=fly-client-ip.');
}

/** Headers for a request into Better Auth: browser headers + trusted client IP. */
export function authRequestHeaders(context: Pick<AuthRequestContext, 'request' | 'clientAddress'>): Headers {
  const headers = new Headers(context.request.headers);
  headers.delete('x-forwarded-for');
  const ip = clientIp(context);
  if (ip) headers.set('x-forwarded-for', ip);
  return headers;
}

/** Copies Better Auth's `Set-Cookie` headers onto Astro's response cookies. */
export function forwardAuthCookies(cookies: AstroCookies, response: Headers): void {
  for (const header of response.getSetCookie()) {
    for (const [name, attributes] of parseSetCookieHeader(header)) {
      const options = toCookieOptions(attributes);
      cookies.set(name, attributes.value, {
        ...options,
        // Better Auth already encoded the value.
        encode: (value) => value,
      });
    }
  }
}

export type AuthCallResult<T> =
  | { ok: true; data: T }
  /** `code`: Better Auth's error code, for callers that word an error differently. */
  | { ok: false; status: number; error: string; code?: string };

/**
 * POSTs a JSON body to a Better Auth endpoint (`path` without `/api/auth`),
 * forwards cookies it sets, and maps errors to a Vietnamese message.
 */
export async function callAuthEndpoint<T = unknown>(
  context: AuthRequestContext,
  path: string,
  body: Record<string, unknown>,
): Promise<AuthCallResult<T>> {
  const url = new URL(`/api/auth${path}`, context.request.url);
  const headers = authRequestHeaders(context);
  headers.set('content-type', 'application/json');
  headers.delete('content-length');

  let response: Response;
  try {
    response = await auth.handler(new Request(url, { method: 'POST', headers, body: JSON.stringify(body) }));
  } catch (error) {
    console.error(`[auth] ${path} failed`, error);
    return { ok: false, status: 500, error: authErrorMessage(500, undefined) };
  }

  forwardAuthCookies(context.cookies, response.headers);
  const data = (await response.json().catch(() => null)) as (T & { code?: string; message?: string }) | null;

  if (!response.ok) {
    if (response.status >= 500) console.error(`[auth] ${path} returned ${response.status}`, data);
    // 403 is a config problem (untrusted origin, disabled path), not a user mistake.
    else if (response.status === 403) {
      console.error(`[auth] ${path} returned 403`, data?.code, 'origin:', headers.get('origin'));
    }
    return {
      ok: false,
      status: response.status,
      error: authErrorMessage(response.status, data?.code, data?.message),
      ...(data?.code ? { code: data.code } : {}),
    };
  }
  return { ok: true, data: data as T };
}
