import type { APIRoute } from 'astro';
import { getWardOptions, listPublicRoomIds } from '../lib/rooms';
import { roomFiltersToQuery } from '../lib/validation/room-filters';

/**
 * Indexable public URLs: home, listing, map, one listing per ward and
 * neighborhood that has rooms, and every available room. Filter combinations
 * are left out (they are `noindex`, see `src/lib/seo.ts`).
 */
const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const GET: APIRoute = async ({ site, url }) => {
  const origin = site ?? url;
  const [wards, rooms] = await Promise.all([getWardOptions(), listPublicRoomIds()]);
  const places = wards.flatMap((ward) => [ward.slug, ...ward.neighborhoods.map((n) => n.slug)]);

  const entries: { path: string; lastmod?: Date }[] = [
    { path: '/' },
    { path: '/phong' },
    { path: '/ban-do' },
    { path: '/chinh-sach-bao-mat' },
    { path: '/dieu-khoan' },
    ...places.map((place) => ({ path: `/phong${roomFiltersToQuery({ place })}` })),
    ...rooms.map((room) => ({ path: `/phong/${encodeURIComponent(room.id)}`, lastmod: room.updatedAt })),
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(
      ({ path, lastmod }) =>
        `  <url><loc>${escapeXml(new URL(path, origin).href)}</loc>${lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : ''}</url>`,
    ),
    '</urlset>',
    '',
  ].join('\n');

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
};
