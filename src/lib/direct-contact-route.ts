/**
 * GET handler shared by `/phong/[id]/goi` (→ `tel:`) and `/phong/[id]/zalo`
 * (→ zalo.me). See `room-direct-contact.ts`.
 *
 * - An hourly limit per client IP (`PHONE_RATE_LIMIT_PER_HOUR` /
 *   `ZALO_RATE_LIMIT_PER_HOUR`, tables `phone_rate_limits` / `zalo_rate_limits`),
 *   counted before the lookup so scraping room ids costs quota too. Over the
 *   limit: back to the room with `?lien-he=gioi-han`, which shows a notice.
 * - No number (room not available, or no Zalo opt-in): back to the contact card.
 * - Never cached, never indexed (also `Disallow`ed in robots.txt), no referrer.
 */
import type { APIRoute } from 'astro';
import { PHONE_RATE_LIMIT_PER_HOUR, ZALO_RATE_LIMIT_PER_HOUR } from 'astro:env/server';
import { clientIp } from './auth/request';
import { takeHourlyQuota } from './rate-limit';
import {
  DIRECT_CONTACT_LIMIT_PARAM,
  DIRECT_CONTACT_LIMIT_VALUE,
  directContactUrl,
  getDirectContactNumber,
  type DirectContactKind,
} from './room-direct-contact';

const PER_HOUR: Record<DirectContactKind, number> = {
  phone: PHONE_RATE_LIMIT_PER_HOUR,
  zalo: ZALO_RATE_LIMIT_PER_HOUR,
};

function redirect(location: string, status: 302 | 303): Response {
  return new Response(null, {
    status,
    headers: {
      Location: location,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      // The destination does not need to know which room the renter came from.
      'Referrer-Policy': 'no-referrer',
    },
  });
}

export function directContactRoute(kind: DirectContactKind): APIRoute {
  return async (context) => {
    const id = context.params.id ?? '';
    const roomPath = `/phong/${encodeURIComponent(id)}`;
    if (!id || id.length > 64) return redirect('/phong', 303);

    if (!(await takeHourlyQuota(kind, clientIp(context), PER_HOUR[kind]))) {
      return redirect(`${roomPath}?${DIRECT_CONTACT_LIMIT_PARAM}=${DIRECT_CONTACT_LIMIT_VALUE}#lien-he`, 303);
    }

    const number = await getDirectContactNumber(kind, id);
    if (!number) return redirect(`${roomPath}#lien-he`, 303);
    return redirect(directContactUrl(kind, number), 302);
  };
}
