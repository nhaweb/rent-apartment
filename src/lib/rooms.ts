/**
 * Public room data access. Pages and components read rooms only through
 * these functions; their signatures are the contract with `src/pages`.
 */
import { and, arrayContains, asc, count, desc, eq, gte, isNotNull, lt, lte, max, min, ne, or, sql, type SQL } from 'drizzle-orm';
import type { GeoPoint, Room, RoomPhoto } from '../types';
import { db } from './db/client';
import { toRoom } from './db/mappers';
import { rooms, type RoomRow } from './db/schema';
import { loadCovers, loadPhotos } from './room-photos-core';
import { placeBySlug, WARDS, wardShortLabel, formatPlace } from './locations';
import { AMENITIES, amenityBySlug, type AmenityInfo } from './amenities';
import type { NumberRange, RoomFilters, RoomSort } from './validation/room-filters';
import type { MapBounds } from './validation/map-bounds';

export const ROOMS_PAGE_SIZE = 12;

export interface PlaceOption {
  /** `khu-vuc` filter value. */
  slug: string;
  /** Ward name, or the neighborhood name. */
  name: string;
  /** `P. Quy Nhơn Nam`, or `Ghềnh Ráng, P. Quy Nhơn Nam`. */
  label: string;
  /** Available rooms here. */
  count: number;
  /** Cheapest available room, VND. */
  minPrice: number;
}

/** A ward with available rooms, and the neighborhoods inside it that have some. */
export interface WardOption extends PlaceOption {
  neighborhoods: PlaceOption[];
}

export interface AmenityOption extends AmenityInfo {
  /** Available rooms that have this amenity. */
  count: number;
}

export interface RoomSearchResult {
  rooms: Room[];
  total: number;
  /** Current page, clamped to `1..pageCount`. */
  page: number;
  pageCount: number;
}

export interface RoomStats {
  availableCount: number;
  minPrice: number;
}

/** Only `available` rooms are ever public. */
const isPublic = eq(rooms.status, 'available');

/** Newest first by publish date (a public room always has one); id breaks ties so paging is stable. */
const newestFirst = [sql`${rooms.publishedAt} desc nulls last`, desc(rooms.createdAt), asc(rooms.id)];

const sortOrder: Record<RoomSort, SQL[]> = {
  'moi-nhat': newestFirst,
  'gia-thap': [asc(rooms.price), ...newestFirst],
  'gia-cao': [desc(rooms.price), ...newestFirst],
  'rong-nhat': [desc(rooms.area), ...newestFirst],
};

/** `min` inclusive, `max` exclusive. */
function inRange(column: typeof rooms.price | typeof rooms.area, range: NumberRange | undefined): SQL[] {
  if (!range) return [];
  const conditions: SQL[] = [];
  if (range.min !== undefined) conditions.push(gte(column, range.min));
  if (range.max !== undefined) conditions.push(lt(column, range.max));
  return conditions;
}


/**
 * Rooms for cards and rows: `photos` holds only the cover (one query for all).
 * The detail page loads every photo (`getRoomById`).
 */
async function withCovers(rows: RoomRow[]): Promise<Room[]> {
  const covers = await loadCovers(db, rows.map((row) => row.id));
  return rows.map((row) => {
    const cover = covers.get(row.id);
    return toRoom(row, cover ? [cover] : []);
  });
}

export async function getLatestRooms(limit = 6): Promise<Room[]> {
  const rows = await db
    .select()
    .from(rooms)
    .where(isPublic)
    .orderBy(...newestFirst)
    .limit(limit);
  return withCovers(rows);
}

export async function getRoomStats(): Promise<RoomStats> {
  const [stats] = await db
    .select({ availableCount: count(), minPrice: min(rooms.price) })
    .from(rooms)
    .where(isPublic);
  return {
    availableCount: stats?.availableCount ?? 0,
    minPrice: stats?.minPrice ?? 0,
  };
}

/**
 * Wards with available rooms, in catalog order, each with its neighborhoods
 * that have rooms. Feeds the `khu-vuc` selects, the footer and home rows.
 */
/**
 * Where to open the map pin picker for each ward: the average position of the
 * ward's public rooms that have one, keyed by ward name. Wards without such a
 * room are missing (the picker falls back to the city center).
 */
export async function getWardCenters(): Promise<Record<string, GeoPoint>> {
  const rows = await db
    .select({
      wardSlug: rooms.wardSlug,
      lat: sql<number>`avg(${rooms.lat})`.mapWith(Number),
      lng: sql<number>`avg(${rooms.lng})`.mapWith(Number),
    })
    .from(rooms)
    .where(and(isPublic, isNotNull(rooms.lat), isNotNull(rooms.lng)))
    .groupBy(rooms.wardSlug);
  const centers: Record<string, GeoPoint> = {};
  for (const ward of WARDS) {
    const row = rows.find((candidate) => candidate.wardSlug === ward.slug);
    if (row && Number.isFinite(row.lat) && Number.isFinite(row.lng)) centers[ward.name] = { lat: row.lat, lng: row.lng };
  }
  return centers;
}

export async function getWardOptions(): Promise<WardOption[]> {
  const rows = await db
    .select({
      wardSlug: rooms.wardSlug,
      neighborhoodSlug: rooms.neighborhoodSlug,
      count: count(),
      minPrice: min(rooms.price).mapWith(Number),
    })
    .from(rooms)
    .where(isPublic)
    .groupBy(rooms.wardSlug, rooms.neighborhoodSlug);

  return WARDS.flatMap((ward): WardOption[] => {
    const inWard = rows.filter((row) => row.wardSlug === ward.slug);
    if (inWard.length === 0) return [];
    const neighborhoods = ward.neighborhoods.flatMap((neighborhood): PlaceOption[] => {
      const row = inWard.find((candidate) => candidate.neighborhoodSlug === neighborhood.slug);
      return row
        ? [
            {
              slug: neighborhood.slug,
              name: neighborhood.name,
              label: formatPlace({ ward: ward.name, neighborhood: neighborhood.name }),
              count: row.count,
              minPrice: row.minPrice,
            },
          ]
        : [];
    });
    return [
      {
        slug: ward.slug,
        name: ward.name,
        label: wardShortLabel(ward.name),
        count: inWard.reduce((sum, row) => sum + row.count, 0),
        minPrice: Math.min(...inWard.map((row) => row.minPrice)),
        neighborhoods,
      },
    ];
  });
}

/** Wards first by room count (for home rows), keeping catalog order on ties. */
export function wardsByCount(wards: WardOption[]): WardOption[] {
  return [...wards].sort((a, b) => b.count - a.count);
}

/** `khu-vuc` slug to a SQL condition: a whole ward or one neighborhood. Unknown slugs match nothing. */
function placeWhere(slug: string | undefined): SQL | undefined {
  if (!slug) return undefined;
  const match = placeBySlug(slug);
  if (!match) return sql`false`;
  return match.kind === 'ward' ? eq(rooms.wardSlug, slug) : eq(rooms.neighborhoodSlug, slug);
}

/** WHERE clause for the public listing filters. */
function filterWhere(filters: Partial<RoomFilters>): SQL | undefined {
  const amenityLabels = (filters.amenities ?? []).flatMap((slug) => amenityBySlug(slug)?.label ?? []);
  return and(
    isPublic,
    placeWhere(filters.place),
    ...inRange(rooms.price, filters.price),
    ...inRange(rooms.area, filters.area),
    amenityLabels.length > 0 ? arrayContains(rooms.amenities, amenityLabels) : undefined,
  );
}

/** Available rooms matching the filters (sort and page are ignored). */
export async function countRooms(filters: Partial<RoomFilters>): Promise<number> {
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(rooms).where(filterWhere(filters));
  return total;
}

export async function searchRooms(
  filters: Partial<RoomFilters>,
  pageSize = ROOMS_PAGE_SIZE,
): Promise<RoomSearchResult> {
  const where = filterWhere(filters);
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(rooms).where(where);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);

  const rows =
    total === 0
      ? []
      : await db
          .select()
          .from(rooms)
          .where(where)
          .orderBy(...sortOrder[filters.sort ?? 'moi-nhat'])
          .limit(pageSize)
          .offset((page - 1) * pageSize);

  return { rooms: await withCovers(rows), total, page, pageCount };
}

/** Filter-panel amenities that at least one available room has, in catalog order. */
export async function getAmenityOptions(): Promise<AmenityOption[]> {
  const result = await db.execute<{ amenity: string; count: number }>(
    sql`select a.amenity, count(*)::int as count
        from ${rooms}, unnest(${rooms.amenities}) as a(amenity)
        where ${rooms.status} = 'available'
        group by a.amenity`,
  );
  const counts = new Map(result.rows.map((row) => [row.amenity, Number(row.count)]));
  return AMENITIES.filter((amenity) => amenity.category && counts.has(amenity.label)).map((amenity) => ({
    ...amenity,
    count: counts.get(amenity.label) ?? 0,
  }));
}

/** A public room, or `undefined` when it does not exist or is not available. */
export async function getRoomById(id: string): Promise<Room | undefined> {
  const [row] = await db
    .select()
    .from(rooms)
    .where(and(isPublic, eq(rooms.id, id)))
    .limit(1);
  if (!row) return undefined;
  const photos = await loadPhotos(db, [row.id]);
  return toRoom(row, photos.get(row.id));
}

/** What a link to a rented room still shows ("Đã có người thuê"); hidden rooms stay unknown. */
export type RentedRoom = Pick<Room, 'id' | 'title' | 'price' | 'ward' | 'neighborhood'>;

export async function getRentedRoom(id: string): Promise<RentedRoom | undefined> {
  const [row] = await db
    .select({ id: rooms.id, title: rooms.title, price: rooms.price, ward: rooms.ward, neighborhood: rooms.neighborhood })
    .from(rooms)
    .where(and(eq(rooms.status, 'rented'), eq(rooms.id, id)))
    .limit(1);
  return row;
}

/** Every public room, for the sitemap. */
export async function listPublicRoomIds(): Promise<{ id: string; updatedAt: Date }[]> {
  return db.select({ id: rooms.id, updatedAt: rooms.updatedAt }).from(rooms).where(isPublic).orderBy(...newestFirst);
}

/** Other rooms in the same ward first, then the closest in price. */
export async function getSimilarRooms(room: Pick<Room, 'id' | 'ward' | 'price'>, limit = 3): Promise<Room[]> {
  const rows = await db
    .select()
    .from(rooms)
    .where(and(isPublic, ne(rooms.id, room.id)))
    .orderBy(
      sql`case when ${rooms.ward} = ${room.ward} then 0 else 1 end`,
      sql`abs(${rooms.price} - ${room.price})`,
      ...newestFirst,
    )
    .limit(limit);
  return withCovers(rows);
}

/** Most markers the map draws at once; zooming in reveals the rest. */
export const MAP_ROOMS_LIMIT = 300;

/** The fields a map marker, preview card and side list need. */
export type MapRoom = Pick<Room, 'id' | 'title' | 'price' | 'area' | 'ward' | 'neighborhood' | 'amenities' | 'createdAt' | 'publishedAt'> & {
  location: GeoPoint;
  /** First photo (`Room.photos[0]`), if any. */
  cover: RoomPhoto | undefined;
};

export interface MapRoomsResult {
  rooms: MapRoom[];
  /** All matches in the area; can exceed `rooms.length` (see `MAP_ROOMS_LIMIT`). */
  total: number;
}

/** Inclusive box; handles a box that crosses the antimeridian. */
function inBounds(bounds: MapBounds): SQL | undefined {
  const lng =
    bounds.west <= bounds.east
      ? and(gte(rooms.lng, bounds.west), lte(rooms.lng, bounds.east))
      : or(gte(rooms.lng, bounds.west), lte(rooms.lng, bounds.east));
  return and(gte(rooms.lat, bounds.south), lte(rooms.lat, bounds.north), lng);
}

/** Public rooms with a location inside `bounds` (anywhere when omitted) that match the listing filters. */
export async function getMapRooms(
  filters: Partial<RoomFilters>,
  bounds: MapBounds | undefined,
  limit = MAP_ROOMS_LIMIT,
): Promise<MapRoomsResult> {
  const where = and(filterWhere(filters), isNotNull(rooms.lat), bounds ? inBounds(bounds) : undefined);
  const [[{ total } = { total: 0 }], rows] = await Promise.all([
    db.select({ total: count() }).from(rooms).where(where),
    db
      .select({
        id: rooms.id,
        title: rooms.title,
        price: rooms.price,
        area: rooms.area,
        ward: rooms.ward,
        neighborhood: rooms.neighborhood,
        amenities: rooms.amenities,
        createdAt: rooms.createdAt,
        publishedAt: rooms.publishedAt,
        lat: rooms.lat,
        lng: rooms.lng,
      })
      .from(rooms)
      .where(where)
      .orderBy(...sortOrder[filters.sort ?? 'moi-nhat'])
      .limit(limit),
  ]);
  const covers = await loadCovers(db, rows.map((row) => row.id));
  return {
    total,
    rooms: rows.flatMap(({ lat, lng, ...room }) =>
      lat === null || lng === null ? [] : [{ ...room, cover: covers.get(room.id), location: { lat, lng } }],
    ),
  };
}

/** Smallest box around every public room that matches the filters and has a location. */
export async function getMapExtent(filters: Partial<RoomFilters>): Promise<MapBounds | undefined> {
  const [extent] = await db
    .select({
      south: min(rooms.lat),
      north: max(rooms.lat),
      west: min(rooms.lng),
      east: max(rooms.lng),
    })
    .from(rooms)
    .where(and(filterWhere(filters), isNotNull(rooms.lat)));
  if (!extent || extent.south === null || extent.north === null || extent.west === null || extent.east === null) {
    return undefined;
  }
  return { south: extent.south, north: extent.north, west: extent.west, east: extent.east };
}
