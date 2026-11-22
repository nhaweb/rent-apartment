/**
 * Signed-in devices for `/quan-ly/tai-khoan` and its actions. Queries are in
 * `landlord-sessions-core.ts`, each scoped by the signed-in user's id.
 */
import { db } from './db/client';
import { createLandlordSessions } from './landlord-sessions-core';

export type { LandlordSession } from './landlord-sessions-core';

export const { listOwnSessions, revokeOwnSession, revokeOtherSessions } = createLandlordSessions(db);

/** "Chrome trên Windows"-style label from a user agent; no parsing library. */
export function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return 'Thiết bị không rõ';
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /CocCoc|coc_coc/i.test(ua)
        ? 'Cốc Cốc'
        : /Zalo/i.test(ua)
          ? 'Zalo'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : /Chrome\//.test(ua)
              ? 'Chrome'
              : /Safari\//.test(ua)
                ? 'Safari'
                : 'Trình duyệt';
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'thiết bị khác';
  return `${browser} trên ${os}`;
}
