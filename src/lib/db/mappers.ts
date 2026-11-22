import type { Room, RoomPhoto, RoomUtilities } from '../../types';
import { slugify } from '../slug';
import type { NewRoomRow, RoomRow } from './schema';

type UtilityColumns = Pick<
  RoomRow,
  'electricityStateRate' | 'electricityPrice' | 'waterPrice' | 'waterUnit' | 'wifiPrice' | 'serviceFee'
>;

export function toUtilities(row: UtilityColumns): RoomUtilities {
  return {
    electricity: row.electricityStateRate
      ? { kind: 'state' }
      : row.electricityPrice !== null
        ? { kind: 'per-kwh', price: row.electricityPrice }
        : null,
    water: row.waterPrice !== null && row.waterUnit !== null ? { price: row.waterPrice, unit: row.waterUnit } : null,
    wifi: row.wifiPrice,
    serviceFee: row.serviceFee,
  };
}

export function toUtilityColumns(utilities: RoomUtilities): UtilityColumns {
  const { electricity, water } = utilities;
  return {
    electricityStateRate: electricity?.kind === 'state',
    electricityPrice: electricity?.kind === 'per-kwh' ? electricity.price : null,
    waterPrice: water?.price ?? null,
    waterUnit: water?.unit ?? null,
    wifiPrice: utilities.wifi,
    serviceFee: utilities.serviceFee,
  };
}

/** Slug columns derived from the place names. */
export function toPlaceColumns(place: Pick<Room, 'ward' | 'neighborhood'>): Pick<NewRoomRow, 'wardSlug' | 'neighborhoodSlug'> {
  return {
    wardSlug: slugify(place.ward),
    neighborhoodSlug: place.neighborhood ? slugify(place.neighborhood) : null,
  };
}

/**
 * DB row to domain `Room`. Drops DB-only columns and folds column groups into
 * objects. Photos live in `room_photos`; pass them in display order.
 */
export function toRoom(row: RoomRow, photos: RoomPhoto[] = []): Room {
  const {
    wardSlug: _wardSlug,
    neighborhoodSlug: _neighborhoodSlug,
    lat,
    lng,
    electricityStateRate,
    electricityPrice,
    waterPrice,
    waterUnit,
    wifiPrice,
    serviceFee,
    ...room
  } = row;
  return {
    ...room,
    location: lat !== null && lng !== null ? { lat, lng } : null,
    utilities: toUtilities({ electricityStateRate, electricityPrice, waterPrice, waterUnit, wifiPrice, serviceFee }),
    photos,
  };
}

/** Domain `Room` to an insertable `rooms` row (photos are separate rows). Derives the slugs, splits `location` and `utilities`. */
export function toRoomRow(room: Room): NewRoomRow {
  const { location, utilities, photos: _photos, ...rest } = room;
  return {
    ...rest,
    ...toPlaceColumns(room),
    ...toUtilityColumns(utilities),
    lat: location?.lat ?? null,
    lng: location?.lng ?? null,
  };
}
