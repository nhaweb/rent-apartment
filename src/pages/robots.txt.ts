import type { APIRoute } from 'astro';
import { ALLOW_INDEXING } from 'astro:env/server';

/**
 * Production (`ALLOW_INDEXING=true`) lets crawlers in except for private and
 * form endpoints; every other deployment (local, test, previews) is closed so
 * test data never reaches search results.
 */
const PRIVATE_PATHS = [
  '/quan-ly',
  '/api/',
  '/_actions/',
  '/dang-nhap',
  '/dang-ky',
  '/quen-mat-khau',
  '/dat-lai-mat-khau',
  '/dang-xuat',
];

export const GET: APIRoute = ({ site, url }) => {
  const origin = site ?? url;
  const body = ALLOW_INDEXING
    ? ['User-agent: *', ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`), '', `Sitemap: ${new URL('/sitemap.xml', origin).href}`]
    : ['User-agent: *', 'Disallow: /'];
  return new Response(`${body.join('\n')}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
