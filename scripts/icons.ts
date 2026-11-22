/**
 * Generates the favicons, app icons and the default share image into
 * `public/`. Run with `npm run icons` after the logo or the hero photo changes.
 *
 * - favicon.ico (32px PNG inside an ICO container), favicon-32.png
 * - apple-touch-icon.png (180px), icon-192.png, icon-512.png: logo mark on a
 *   white square with padding (iOS and Android fill transparency with black)
 * - og-default.jpg (1200x630): the hero photo, cropped, no text on it
 * - brand/zalo.webp (96px): the Zalo logo for "Nhắn Zalo" on room pages, from
 *   `assets-src/brand/zalo.png` (the official logo, never recolored)
 *
 * Sources: `public/logo/logo-mark.webp`, `src/assets/quy-nhon/beach-promenade.webp`.
 */
import { writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const MARK = 'public/logo/logo-mark.webp';
const HERO = 'src/assets/quy-nhon/beach-promenade.webp';
const ZALO = 'assets-src/brand/zalo.png';
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };
const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };

/** The mark centered on a `size` square, taking `fill` of it. */
async function square(size: number, fill: number, background: typeof WHITE): Promise<Buffer> {
  const inner = Math.round(size * fill);
  const mark = await sharp(MARK).resize(inner, inner, { fit: 'contain', background: CLEAR }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, gravity: 'center' }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ICO file holding one PNG image (supported by every current browser). */
function ico(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6 + 16);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(size >= 256 ? 0 : size, 6);
  header.writeUInt8(size >= 256 ? 0 : size, 7);
  header.writeUInt8(0, 8); // no palette
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10); // planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(22, 18); // image offset
  return Buffer.concat([header, png]);
}

const favicon = await square(32, 1, CLEAR);
await writeFile('public/favicon-32.png', favicon);
await writeFile('public/favicon.ico', ico(favicon, 32));
await writeFile('public/apple-touch-icon.png', await square(180, 0.8, WHITE));
await writeFile('public/icon-192.png', await square(192, 0.7, WHITE));
await writeFile('public/icon-512.png', await square(512, 0.7, WHITE));
await sharp(HERO)
  .resize(1200, 630, { fit: 'cover', position: 'attention' })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile('public/og-default.jpg');

await sharp(ZALO)
  .resize(96, 96, { fit: 'contain', background: CLEAR })
  .webp({ quality: 90, alphaQuality: 100 })
  .toFile('public/brand/zalo.webp');

console.log('Wrote favicon.ico, favicon-32.png, apple-touch-icon.png, icon-192.png, icon-512.png, og-default.jpg, brand/zalo.webp');
