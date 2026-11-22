/**
 * Shared-cache headers for public SSR pages. A CDN (Vercel) may keep the page
 * for `seconds` and serve a stale copy while it refreshes, so a busy listing
 * costs one DB round trip per minute instead of one per view. Browsers always
 * revalidate (`max-age=0`). On Fly.io there is no CDN in front; the header is
 * then harmless.
 *
 * Never cached: non-GET requests (form posts), responses for a visitor with a
 * session cookie, and URLs that carry a one-off notice (`?da-gui`, `?lien-he`).
 */
interface CacheContext {
  request: Request;
  url: URL;
  response: { headers: Headers };
}

// `lien-he`: the "Gọi điện" / "Nhắn Zalo" limit notice (`src/lib/room-direct-contact.ts`).
const NO_CACHE_PARAMS = ['da-gui', 'lien-he'];

export function setPublicCache(context: CacheContext, seconds = 60): void {
  const { request, url, response } = context;
  const personal =
    request.method !== 'GET' ||
    (request.headers.get('cookie') ?? '').includes('session_token') ||
    NO_CACHE_PARAMS.some((param) => url.searchParams.has(param));
  if (personal) {
    response.headers.set('Cache-Control', 'private, no-store');
    return;
  }
  response.headers.set('Cache-Control', `public, max-age=0, s-maxage=${seconds}, stale-while-revalidate=${seconds * 5}`);
  // The header and footer differ for a signed-in landlord ("Đăng phòng" vs
  // "Cho thuê phòng"). Should a CDN still hand this copy to one, the sign-up
  // link is harmless: the middleware sends signed-in users on to `next`.
  response.headers.append('Vary', 'Cookie');
}
