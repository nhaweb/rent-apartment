/**
 * Route protection for the landlord dashboard, plus security headers on every
 * server-rendered response. All auth logic lives in `src/lib/auth`; this file
 * only decides where requests go.
 */
import { defineMiddleware } from 'astro:middleware';
import { getAuthState, isProtectedPath, safeNextPath, SIGN_IN_PATH, SIGN_UP_PATH } from './lib/auth';

/** Pages whose URL carries a secret (reset token): never send it as a referrer. */
const NO_REFERRER_PATHS = new Set(['/dat-lai-mat-khau']);

/**
 * No CSP yet: MapLibre (workers, blob URLs), OpenFreeMap tiles, R2 images and
 * the WebP/HEIC wasm fallbacks need a tested allowlist first.
 */
function setSecurityHeaders(headers: Headers, pathname: string): void {
  headers.set('x-content-type-options', 'nosniff');
  // No X-Frame-Options / frame-ancestors: the site must be embeddable in an iframe on another website.
  // A route may set a stricter policy itself (`/phong/[id]/goi`, `/phong/[id]/zalo`: no-referrer).
  if (NO_REFERRER_PATHS.has(pathname)) headers.set('referrer-policy', 'no-referrer');
  else if (!headers.has('referrer-policy')) headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  // Browsers ignore HSTS over plain http, so `npm run preview` on localhost is unaffected.
  if (import.meta.env.PROD) headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  // Prerendered pages have no request headers or session.
  if (context.isPrerendered) return next();

  if (isProtectedPath(pathname)) {
    if (!(await getAuthState(context))) {
      // A form posted after the session expired: come back to the page, not
      // to `?_action=…` (the form data is gone after sign-in anyway).
      const params = new URLSearchParams(context.url.search);
      params.delete('_action');
      const search = params.size > 0 ? `?${params}` : '';
      const target = `${SIGN_IN_PATH}?next=${encodeURIComponent(pathname + search)}`;
      return context.redirect(target, 303);
    }
  } else if (pathname === SIGN_IN_PATH || pathname === SIGN_UP_PATH) {
    // Already signed in: go where they were heading (e.g. "Đăng phòng"), else the dashboard.
    if (await getAuthState(context)) return context.redirect(safeNextPath(context.url.searchParams.get('next')), 303);
  }

  const response = await next();
  try {
    setSecurityHeaders(response.headers, pathname);
    // Signed-in pages must never be cached by a shared proxy.
    if (isProtectedPath(pathname)) response.headers.set('cache-control', 'private, no-store');
  } catch {
    // Some responses (e.g. `Response.redirect`) have immutable headers.
  }
  return response;
});
