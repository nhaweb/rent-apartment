/**
 * GET /api/dem-phong?<listing filters> -> { "total": number }
 * Live result count for the filter panel ("Xem N phòng"). Same params and
 * validation as /phong; bad values fall back to "no filter".
 */
import type { APIRoute } from 'astro';
import { countRooms } from '../../lib/rooms';
import { parseRoomFilters } from '../../lib/validation/room-filters';

export const GET: APIRoute = async ({ url }) => {
  const total = await countRooms(parseRoomFilters(url.searchParams));
  return Response.json(
    { total },
    // Short shared cache: counts change only when a landlord edits a room.
    { headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60' } },
  );
};
