/**
 * Reads the first bytes of a WebP file: dimensions and metadata flags.
 * Used to check uploads server-side instead of trusting the client.
 * See https://developers.google.com/speed/webp/docs/riff_container
 */

/** Enough bytes for every header variant below. */
export const WEBP_HEADER_BYTES = 30;

export interface WebpInfo {
  width: number;
  height: number;
  /** True when the extended header says the file carries EXIF or XMP metadata. */
  hasMetadata: boolean;
  animated: boolean;
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

const u24 = (bytes: Uint8Array, at: number) => bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16);

/** `undefined` when the bytes are not a WebP header. */
export function readWebpInfo(bytes: Uint8Array): WebpInfo | undefined {
  if (bytes.length < WEBP_HEADER_BYTES) return undefined;
  if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return undefined;
  const chunk = ascii(bytes, 12, 4);

  if (chunk === 'VP8X') {
    const flags = bytes[20]!;
    return {
      width: 1 + u24(bytes, 24),
      height: 1 + u24(bytes, 27),
      hasMetadata: (flags & 0x08) !== 0 || (flags & 0x04) !== 0,
      animated: (flags & 0x02) !== 0,
    };
  }
  if (chunk === 'VP8 ') {
    // Key frame start code 9d 01 2a, then 14-bit width and height.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return undefined;
    return {
      width: (bytes[26]! | (bytes[27]! << 8)) & 0x3fff,
      height: (bytes[28]! | (bytes[29]! << 8)) & 0x3fff,
      hasMetadata: false,
      animated: false,
    };
  }
  if (chunk === 'VP8L') {
    if (bytes[20] !== 0x2f) return undefined;
    const bits = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    return {
      width: 1 + (bits & 0x3fff),
      height: 1 + ((bits >>> 14) & 0x3fff),
      hasMetadata: false,
      animated: false,
    };
  }
  return undefined;
}
