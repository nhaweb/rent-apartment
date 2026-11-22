export const ROOM_STATUSES = ['available', 'rented', 'hidden'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const WATER_UNITS = ['m3', 'person'] as const;
export type WaterUnit = (typeof WATER_UNITS)[number];

/**
 * One uploaded photo. Both files are WebP in object storage (no EXIF):
 * `key` is at most 1600px on the long edge, `thumbKey` at most 600px.
 * Public URL: `photoUrl(key)` (`src/lib/photo-urls.ts`).
 */
export interface RoomPhoto {
  id: string;
  key: string;
  thumbKey: string;
  /** Pixel size of the full image (`key`); the thumbnail has the same aspect ratio. */
  width: number;
  height: number;
  /** 0-based; the photo with the lowest value is the cover. */
  sortOrder: number;
}

/** WGS84 coordinates. */
export interface GeoPoint {
  lat: number;
  lng: number;
}

/** How electricity is charged. `null` on `RoomUtilities` means "Thỏa thuận". */
export type ElectricityCost =
  /** Billed at the state (EVN) household tariff. */
  | { kind: 'state' }
  /** Fixed price per kWh, VND. 0 = free / included in rent. */
  | { kind: 'per-kwh'; price: number };

export interface WaterCost {
  /** VND per m³ or per person per month. 0 = free / included in rent. */
  price: number;
  unit: WaterUnit;
}

/**
 * Monthly running costs. Every field: `null` = not stated ("Thỏa thuận"),
 * 0 = free / included in rent ("Miễn phí / đã bao gồm"). Integers in VND.
 */
export interface RoomUtilities {
  electricity: ElectricityCost | null;
  water: WaterCost | null;
  /** VND per month. */
  wifi: number | null;
  /** Service fee (rác, vệ sinh, giữ xe...), VND per month. */
  serviceFee: number | null;
}

export interface Room {
  id: string;
  landlordId: string;
  title: string;
  description: string;
  /** Monthly rent in VND, integer. Format only at display time. */
  price: number;
  /** Deposit in VND, integer. */
  deposit: number;
  /** Floor area in square meters. */
  area: number;
  /** Street, no house number. */
  address: string;
  /** Official ward/commune name (see `src/lib/locations.ts`), e.g. `Quy Nhơn Nam`. */
  ward: string;
  /** Former ward name people still use ("Khu vực quen gọi"), inside `ward`; optional. */
  neighborhood: string | null;
  /** Always `PROVINCE` for now. */
  province: string;
  /**
   * Approximate map position (street level, never the exact house), or `null`
   * when the address has not been placed yet. Rooms without one are left off the map.
   */
  location: GeoPoint | null;
  utilities: RoomUtilities;
  amenities: string[];
  /** Ordered by `sortOrder`; `photos[0]` is the cover. Stored in `room_photos`. */
  photos: RoomPhoto[];
  status: RoomStatus;
  createdAt: Date;
  /**
   * First time the room became `available` ("Đăng N ngày trước", "Mới đăng",
   * newest-first sort). `null` while it has never been public. A room drafted
   * for a week is still "new" when it goes live.
   */
  publishedAt: Date | null;
  updatedAt: Date;
}
