import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fitWithin, parsePhotoKey, photoKeys } from '../src/lib/photo-rules';
import { readWebpInfo, WEBP_HEADER_BYTES } from '../src/lib/webp';

const UUID = '3f9a1c2b-1234-4abc-8def-0123456789ab';

test('photoKeys and parsePhotoKey round-trip', () => {
  const { key, thumbKey } = photoKeys('phong-a-1', UUID);
  assert.deepEqual(parsePhotoKey(key), { roomId: 'phong-a-1', uuid: UUID, thumb: false });
  assert.deepEqual(parsePhotoKey(thumbKey), { roomId: 'phong-a-1', uuid: UUID, thumb: true });
});

test('parsePhotoKey rejects anything else', () => {
  for (const key of ['rooms/a/not-a-uuid.webp', `rooms/a/${UUID}.png`, `other/a/${UUID}.webp`, `rooms/a/b/${UUID}.webp`]) {
    assert.equal(parsePhotoKey(key), undefined, key);
  }
});

test('fitWithin scales down, never up', () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
});

/** A VP8X header: canvas `width`×`height`, with the given flag byte. */
function vp8x(width: number, height: number, flags: number): Uint8Array {
  const bytes = new Uint8Array(WEBP_HEADER_BYTES);
  bytes.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0);
  bytes.set([...'WEBP'].map((c) => c.charCodeAt(0)), 8);
  bytes.set([...'VP8X'].map((c) => c.charCodeAt(0)), 12);
  bytes[20] = flags;
  const w = width - 1;
  const h = height - 1;
  bytes.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff], 24);
  bytes.set([h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 27);
  return bytes;
}

test('readWebpInfo reads VP8X size and metadata flags', () => {
  assert.deepEqual(readWebpInfo(vp8x(1600, 1200, 0)), { width: 1600, height: 1200, hasMetadata: false, animated: false });
  assert.equal(readWebpInfo(vp8x(10, 10, 0x08))?.hasMetadata, true); // EXIF
  assert.equal(readWebpInfo(vp8x(10, 10, 0x04))?.hasMetadata, true); // XMP
  assert.equal(readWebpInfo(vp8x(10, 10, 0x02))?.animated, true);
});

test('readWebpInfo rejects non-WebP bytes', () => {
  assert.equal(readWebpInfo(new Uint8Array(WEBP_HEADER_BYTES)), undefined);
  assert.equal(readWebpInfo(new Uint8Array(4)), undefined);
});
