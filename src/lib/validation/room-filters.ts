import { z } from 'astro/zod';
import { amenityBySlug } from '../amenities';

/** Query-string names for the public listing (`/phong?khu-vuc=...&gia=...`). */
export const ROOM_FILTER_PARAMS = {
  place: 'khu-vuc',
  price: 'gia',
  area: 'dien-tich',
  amenities: 'tien-ich',
  sort: 'sap-xep',
  page: 'trang',
} as const;

export const ROOM_SORTS = ['moi-nhat', 'gia-thap', 'gia-cao', 'rong-nhat'] as const;
export type RoomSort = (typeof ROOM_SORTS)[number];
export const DEFAULT_SORT: RoomSort = 'moi-nhat';

export interface NumberRange {
  /** Inclusive lower bound. */
  min?: number;
  /** Exclusive upper bound. */
  max?: number;
}

/**
 * A range written as `min-max`, either side optional: `2000000-3500000`, `-2000000`, `30-`.
 * Anything malformed becomes `undefined`, so a bad link shows all rooms instead of an error.
 */
const rangeParamSchema = z
  .string()
  .regex(/^\d{0,10}-\d{0,10}$/)
  .transform((value): NumberRange | undefined => {
    const [rawMin, rawMax] = value.split('-');
    const min = rawMin ? Number(rawMin) : undefined;
    const max = rawMax ? Number(rawMax) : undefined;
    if (min === undefined && max === undefined) return undefined;
    if (min !== undefined && max !== undefined && min >= max) return undefined;
    return { min, max };
  })
  .optional()
  .catch(undefined);

/** Comma-separated amenity slugs; unknown slugs are dropped, the result is a sorted unique list. */
const amenitiesParamSchema = z
  .string()
  .max(400)
  .transform((value) => [...new Set(value.split(',').filter((slug) => amenityBySlug(slug)))].sort())
  .catch([]);

export const roomFiltersSchema = z.object({
  /**
   * Ward slug (`quy-nhon-nam`) or neighborhood slug (`ghenh-rang`); see
   * `placeBySlug` in `src/lib/locations.ts`.
   */
  place: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,60}$/)
    .optional()
    .catch(undefined),
  price: rangeParamSchema,
  area: rangeParamSchema,
  /** Amenity slugs (see `src/lib/amenities.ts`); a room must have all of them. */
  amenities: amenitiesParamSchema,
  sort: z.enum(ROOM_SORTS).catch(DEFAULT_SORT),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});

export type RoomFilters = z.infer<typeof roomFiltersSchema>;

const nonEmpty = (value: string | null) => (value ? value : undefined);

export function parseRoomFilters(params: URLSearchParams): RoomFilters {
  return roomFiltersSchema.parse({
    place: nonEmpty(params.get(ROOM_FILTER_PARAMS.place)),
    price: nonEmpty(params.get(ROOM_FILTER_PARAMS.price)),
    area: nonEmpty(params.get(ROOM_FILTER_PARAMS.area)),
    // Checkboxes submit one param per value; links use a comma list. Accept both.
    amenities: params.getAll(ROOM_FILTER_PARAMS.amenities).join(','),
    sort: params.get(ROOM_FILTER_PARAMS.sort) ?? undefined,
    page: params.get(ROOM_FILTER_PARAMS.page) ?? undefined,
  });
}

export function rangeToParam(range: NumberRange | undefined): string {
  if (!range) return '';
  return `${range.min ?? ''}-${range.max ?? ''}`;
}

/** True when anything narrows the result set (sort and page do not). */
export function hasActiveFilters(filters: Partial<RoomFilters>): boolean {
  return Boolean(filters.place || filters.price || filters.area || filters.amenities?.length);
}

/** Builds `?...` for the given filters; empty values, the default sort and page 1 are left out. */
export function roomFiltersToQuery(filters: Partial<RoomFilters>): string {
  const params = new URLSearchParams();
  if (filters.place) params.set(ROOM_FILTER_PARAMS.place, filters.place);
  if (filters.price) params.set(ROOM_FILTER_PARAMS.price, rangeToParam(filters.price));
  if (filters.area) params.set(ROOM_FILTER_PARAMS.area, rangeToParam(filters.area));
  if (filters.amenities?.length) params.set(ROOM_FILTER_PARAMS.amenities, [...filters.amenities].sort().join(','));
  if (filters.sort && filters.sort !== DEFAULT_SORT) params.set(ROOM_FILTER_PARAMS.sort, filters.sort);
  if (filters.page && filters.page > 1) params.set(ROOM_FILTER_PARAMS.page, String(filters.page));
  const query = params.toString();
  // Keep commas readable in shared links.
  return query ? `?${query.replaceAll('%2C', ',')}` : '';
}
