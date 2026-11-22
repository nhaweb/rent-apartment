/**
 * Public URLs for room photos (`PUBLIC_IMAGE_BASE_URL` + object key). Safe in
 * server code and in browser scripts. Images are served as stored: no
 * on-the-fly resizing, so `srcset` offers the 600px thumbnail and the full file.
 */
import { PUBLIC_IMAGE_BASE_URL } from 'astro:env/client';
import type { RoomPhoto } from '../types';
import { fitWithin, THUMB_MAX_EDGE } from './photo-rules';

const base = PUBLIC_IMAGE_BASE_URL.replace(/\/+$/, '');

export function photoUrl(key: string): string {
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

/** Thumbnail pixel size, derived from the full size. */
export function thumbSize(photo: Pick<RoomPhoto, 'width' | 'height'>): { width: number; height: number } {
  return fitWithin(photo.width, photo.height, THUMB_MAX_EDGE);
}

/** `src` + `srcset` for an `<img>`; `prefer: 'thumb'` for grids, `'full'` for the detail page. */
export function photoSources(photo: RoomPhoto, prefer: 'thumb' | 'full') {
  const thumb = thumbSize(photo);
  const candidates =
    thumb.width < photo.width
      ? `${photoUrl(photo.thumbKey)} ${thumb.width}w, ${photoUrl(photo.key)} ${photo.width}w`
      : `${photoUrl(photo.key)} ${photo.width}w`;
  return { src: photoUrl(prefer === 'thumb' ? photo.thumbKey : photo.key), srcset: candidates };
}
