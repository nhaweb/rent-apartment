/**
 * Browser-side photo preparation for upload: decode -> resize -> WebP.
 *
 * Drawing into a canvas and encoding from its pixels keeps no metadata, so
 * EXIF (including GPS position from phone cameras) never leaves the device.
 * Orientation is applied while decoding, before EXIF is dropped.
 *
 * Fallbacks, each loaded only when needed:
 * - HEIC on browsers that cannot decode it (Chrome, Android, Windows): `heic-to` (libheif WASM).
 * - Canvas that cannot encode WebP (Safari): `@jsquash/webp` (libwebp WASM).
 */
import {
  ACCEPTED_INPUT_EXTENSIONS,
  ACCEPTED_INPUT_TYPES,
  fitWithin,
  FULL_MAX_EDGE,
  MAX_ORIGINAL_BYTES,
  THUMB_MAX_EDGE,
  UPLOAD_CONTENT_TYPE,
  WEBP_QUALITY,
} from '../../../lib/photo-rules';

/** A problem to show on the tile, already in Vietnamese. */
export class PhotoError extends Error {
  /** False when trying again cannot help (wrong file type, too large). */
  constructor(
    message: string,
    readonly retryable = true,
  ) {
    super(message);
  }
}

export interface ProcessedPhoto {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

type Stage = 'heic';

const extension = (name: string) => name.slice(name.lastIndexOf('.')).toLowerCase();

function isHeic(file: File): boolean {
  return /heic|heif/i.test(file.type) || ['.heic', '.heif'].includes(extension(file.name));
}

/** Checks a picked file before any work; returns the problem, if any. */
export function checkFile(file: File): PhotoError | undefined {
  const typeOk =
    (ACCEPTED_INPUT_TYPES as readonly string[]).includes(file.type) ||
    (ACCEPTED_INPUT_EXTENSIONS as readonly string[]).includes(extension(file.name));
  if (!typeOk) return new PhotoError('Chỉ nhận ảnh JPG, PNG, WebP hoặc HEIC.', false);
  if (file.size > MAX_ORIGINAL_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1).replace('.', ',');
    return new PhotoError(`Ảnh nặng ${mb} MB, tối đa 15 MB.`, false);
  }
  return undefined;
}

type Decoded = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decodeWithImg(file: Blob): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  // <img> applies EXIF orientation (image-orientation: from-image is the default).
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

async function decode(file: File, onStage: (stage: Stage) => void): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    // Safari can decode HEIC in <img> even where createImageBitmap(blob) fails.
  }
  try {
    return await decodeWithImg(file);
  } catch {
    if (!isHeic(file)) throw new PhotoError('Không đọc được ảnh này. Hãy thử ảnh khác.', false);
  }
  onStage('heic');
  try {
    const { heicTo } = await import('heic-to');
    // libheif applies the HEIC rotation itself.
    const bitmap = await heicTo({ blob: file, type: 'bitmap' });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    throw new PhotoError('Không đọc được ảnh HEIC này. Hãy thử ảnh khác.', false);
  }
}

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

function draw(source: CanvasImageSource, width: number, height: number): AnyCanvas {
  const canvas: AnyCanvas =
    typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(width, height) : Object.assign(document.createElement('canvas'), { width, height });
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) throw new PhotoError('Trình duyệt không xử lý được ảnh. Hãy thử trình duyệt khác.', false);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

async function nativeWebp(canvas: AnyCanvas): Promise<Blob | null> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: UPLOAD_CONTENT_TYPE, quality: WEBP_QUALITY }).catch(() => null);
  }
  return new Promise((resolve) => canvas.toBlob(resolve, UPLOAD_CONTENT_TYPE, WEBP_QUALITY));
}

async function encode(canvas: AnyCanvas): Promise<Blob> {
  const native = await nativeWebp(canvas);
  // Browsers that cannot encode WebP silently return PNG instead.
  if (native?.type === UPLOAD_CONTENT_TYPE) return native;
  const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const { default: encodeWebp } = await import('@jsquash/webp/encode');
  const buffer = await encodeWebp(pixels, { quality: Math.round(WEBP_QUALITY * 100) });
  return new Blob([buffer], { type: UPLOAD_CONTENT_TYPE });
}

/** Full image (≤1600px) and thumbnail (≤600px), both WebP without metadata. */
export async function processImage(file: File, onStage: (stage: Stage) => void = () => {}): Promise<ProcessedPhoto> {
  const problem = checkFile(file);
  if (problem) throw problem;

  const decoded = await decode(file, onStage);
  try {
    const full = fitWithin(decoded.width, decoded.height, FULL_MAX_EDGE);
    const thumb = fitWithin(decoded.width, decoded.height, THUMB_MAX_EDGE);
    const fullCanvas = draw(decoded.source, full.width, full.height);
    decoded.release();
    // The thumbnail comes from the already reduced image: sharper and cheaper.
    const thumbCanvas = draw(fullCanvas, thumb.width, thumb.height);
    const [fullBlob, thumbBlob] = await Promise.all([encode(fullCanvas), encode(thumbCanvas)]);
    return { full: fullBlob, thumb: thumbBlob, width: full.width, height: full.height };
  } catch (error) {
    decoded.release();
    if (error instanceof PhotoError) throw error;
    throw new PhotoError('Không xử lý được ảnh này. Hãy thử lại.');
  }
}

/** PUT to a presigned URL with upload progress (fetch has none). */
export function uploadBlob(url: string, blob: Blob, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PUT', url);
    // Must match the signed Content-Type exactly.
    request.setRequestHeader('Content-Type', UPLOAD_CONTENT_TYPE);
    request.upload.onprogress = (event) => onProgress(event.loaded);
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(blob.size);
        resolve();
      } else reject(new PhotoError(`Tải ảnh lên không thành công (lỗi ${request.status}).`));
    };
    request.onerror = () => reject(new PhotoError('Mất kết nối khi tải ảnh lên.'));
    request.send(blob);
  });
}
