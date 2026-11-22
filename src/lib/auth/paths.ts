/**
 * Auth route paths and redirect checks. No `astro:*` or DB imports, so unit
 * tests (`npm test`) can load it; `./index.ts` re-exports everything here.
 */
export const SIGN_IN_PATH = '/dang-nhap';
export const SIGN_UP_PATH = '/dang-ky';
export const DASHBOARD_PATH = '/quan-ly';

/**
 * Validates a post-login redirect target: same-site path only, never the
 * auth pages themselves. Anything else goes to the dashboard.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return DASHBOARD_PATH;
  try {
    const url = new URL(value, 'http://localhost');
    if (url.origin !== 'http://localhost') return DASHBOARD_PATH;
    if (url.pathname === SIGN_IN_PATH || url.pathname === SIGN_UP_PATH) return DASHBOARD_PATH;
    return url.pathname + url.search + url.hash;
  } catch {
    return DASHBOARD_PATH;
  }
}

/** True for `/quan-ly` and everything under it. */
export function isProtectedPath(pathname: string): boolean {
  return pathname === DASHBOARD_PATH || pathname.startsWith(`${DASHBOARD_PATH}/`);
}
