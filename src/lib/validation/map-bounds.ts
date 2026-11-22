import { z } from 'astro/zod';

/** Query-string name for the map viewport (`/ban-do?bbox=south,west,north,east`). */
export const MAP_BOUNDS_PARAM = 'bbox';

/** Visible map area. `west > east` means the box crosses the antimeridian. */
export interface MapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

const coordinate = /^-?\d{1,3}(\.\d{1,7})?$/;

/**
 * `south,west,north,east` in degrees. Anything malformed becomes `undefined`,
 * so a bad link falls back to "fit all rooms" instead of an error.
 */
export const mapBoundsSchema = z
  .string()
  .max(80)
  .transform((value, ctx): MapBounds => {
    const parts = value.split(',');
    if (parts.length !== 4 || !parts.every((part) => coordinate.test(part))) {
      ctx.addIssue({ code: 'custom', message: 'bbox' });
      return z.NEVER;
    }
    const [south, west, north, east] = parts.map(Number) as [number, number, number, number];
    const latOk = (lat: number) => lat >= -90 && lat <= 90;
    const lngOk = (lng: number) => lng >= -180 && lng <= 180;
    if (!latOk(south) || !latOk(north) || !lngOk(west) || !lngOk(east) || south >= north) {
      ctx.addIssue({ code: 'custom', message: 'bbox' });
      return z.NEVER;
    }
    return { south, west, north, east };
  })
  .optional()
  .catch(undefined);

export function parseMapBounds(params: URLSearchParams): MapBounds | undefined {
  return mapBoundsSchema.parse(params.get(MAP_BOUNDS_PARAM) ?? undefined);
}

/** Rounded to ~1 m so URLs stay short and cache keys repeat. */
export function mapBoundsToParam(bounds: MapBounds): string {
  return [bounds.south, bounds.west, bounds.north, bounds.east].map((n) => n.toFixed(5)).join(',');
}
