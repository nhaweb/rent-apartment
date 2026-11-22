/**
 * Room data for the map page (`/ban-do`) and its API (`/api/ban-do`).
 * The client script draws markers and cards from these plain objects, so
 * every label is formatted and every photo URL is built here.
 */
import { cardTags } from './amenities';
import { formatPlace } from './locations';
import { formatArea, formatPriceMarker, formatPriceShort, isRecentlyPosted, postedDate } from './format';
import { photoSources } from './photo-urls';
import type { RoomPhoto } from '../types';
import type { MapRoom, MapRoomsResult } from './rooms';
import type { MapBounds } from './validation/map-bounds';

export interface MapRoomPhoto {
  src: string;
  srcset: string;
}

/** Wire format shared with `src/components/map/room-map.ts`. */
export interface MapRoomView {
  id: string;
  href: string;
  title: string;
  lat: number;
  lng: number;
  /** Marker label, e.g. `6,5 tr`. */
  marker: string;
  /** Card price, e.g. `6,5 triệu`. */
  price: string;
  /** `Ghềnh Ráng, P. Quy Nhơn Nam`. */
  place: string;
  /** Area and up to two amenities. */
  details: string;
  isNew: boolean;
  photo: MapRoomPhoto | null;
}

export interface MapPayload {
  total: number;
  rooms: MapRoomView[];
}

/** Map cards render at most ~340 CSS px wide: the 600px thumbnail, full size for dense screens. */
function mapPhoto(photo: RoomPhoto | undefined): MapRoomPhoto | null {
  return photo ? photoSources(photo, 'thumb') : null;
}

export function toMapRoomView(room: MapRoom): MapRoomView {
  return {
    id: room.id,
    href: `/phong/${room.id}`,
    title: room.title,
    lat: room.location.lat,
    lng: room.location.lng,
    marker: formatPriceMarker(room.price),
    price: formatPriceShort(room.price),
    place: formatPlace(room),
    details: [formatArea(room.area), ...cardTags(room.amenities, 2)].join(' · '),
    isNew: isRecentlyPosted(postedDate(room)),
    photo: mapPhoto(room.cover),
  };
}

export function toMapPayload(result: MapRoomsResult): MapPayload {
  return { total: result.total, rooms: result.rooms.map(toMapRoomView) };
}

/** Pads a single-point or tiny extent so the first view is not zoomed in to one street. */
export function padExtent(extent: MapBounds, minSpan = 0.02): MapBounds {
  const latPad = Math.max(0, (minSpan - (extent.north - extent.south)) / 2);
  const lngPad = Math.max(0, (minSpan - (extent.east - extent.west)) / 2);
  return {
    south: extent.south - latPad,
    north: extent.north + latPad,
    west: extent.west - lngPad,
    east: extent.east + lngPad,
  };
}
