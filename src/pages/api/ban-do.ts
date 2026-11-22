/**
 * GET /api/ban-do?bbox=south,west,north,east&<listing filters> -> MapPayload
 * Rooms inside the visible map area, for the map page. Same filter params as
 * /phong; a missing or malformed bbox means "everywhere".
 */
import type { APIRoute } from 'astro';
import { toMapPayload } from '../../lib/map';
import { getMapRooms } from '../../lib/rooms';
import { parseMapBounds } from '../../lib/validation/map-bounds';
import { parseRoomFilters } from '../../lib/validation/room-filters';

export const GET: APIRoute = async ({ url }) => {
  const result = await getMapRooms(parseRoomFilters(url.searchParams), parseMapBounds(url.searchParams));
  return Response.json(toMapPayload(result), {
    // Same freshness as the live count: rooms change only when a landlord edits one.
    headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60' },
  });
};
