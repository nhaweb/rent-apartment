/**
 * Tools the chat model may call. Each one reads public data through
 * `src/lib/rooms.ts` (available rooms only) and never exposes landlord data.
 */
import type { Room } from '../../types';
import { AMENITIES, amenityBySlug } from '../amenities';
import { formatArea, formatPrice, formatUtilities } from '../format';
import { formatPlace, placeBySlug, WARDS } from '../locations';
import { photoUrl, thumbSize } from '../photo-urls';
import { getRoomById, searchRooms } from '../rooms';
import { ROOM_SORTS, roomFiltersToQuery, type NumberRange, type RoomFilters, type RoomSort } from '../validation/room-filters';
import { ROOM_ID_PATTERN } from '../validation/room';
import type { GeminiFunctionDeclaration } from './gemini';

/** Room card the widget renders under a reply. */
export interface ChatRoomCard {
  id: string;
  title: string;
  price: string;
  area: string;
  place: string;
  url: string;
  thumb?: { src: string; width: number; height: number };
}

export interface ToolResult {
  /** What the model sees. */
  response: Record<string, unknown>;
  cards: ChatRoomCard[];
  /** `/phong?...` with the same filters, when the tool searched. */
  listingUrl?: string;
  total?: number;
}

const SEARCH_LIMIT = 5;

export const PLACE_SLUGS = WARDS.flatMap((ward) => [ward.slug, ...ward.neighborhoods.map((n) => n.slug)]);
export const AMENITY_SLUGS = AMENITIES.map((amenity) => amenity.slug);

export const TOOL_DECLARATIONS: GeminiFunctionDeclaration[] = [
  {
    name: 'search_rooms',
    description:
      'Tìm phòng trọ đang còn trống theo khu vực, giá, diện tích, tiện ích. Trả về tối đa 5 phòng và tổng số phòng khớp.',
    parameters: {
      type: 'object',
      properties: {
        place: { type: 'string', enum: PLACE_SLUGS, description: 'Slug phường hoặc khu vực quen gọi.' },
        priceMin: { type: 'integer', description: 'Giá thuê tối thiểu, VND/tháng (bao gồm).' },
        priceMax: { type: 'integer', description: 'Giá thuê tối đa, VND/tháng (không bao gồm).' },
        areaMin: { type: 'integer', description: 'Diện tích tối thiểu, m² (bao gồm).' },
        areaMax: { type: 'integer', description: 'Diện tích tối đa, m² (không bao gồm).' },
        amenities: {
          type: 'array',
          items: { type: 'string', enum: AMENITY_SLUGS },
          description: 'Phòng phải có tất cả các tiện ích này.',
        },
        sort: {
          type: 'string',
          enum: [...ROOM_SORTS],
          description: 'moi-nhat (mặc định), gia-thap, gia-cao, rong-nhat.',
        },
      },
    },
  },
  {
    name: 'get_room',
    description: 'Lấy thông tin chi tiết công khai của một phòng theo id (giá, cọc, chi phí điện nước, tiện ích, mô tả).',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Id phòng.' } },
      required: ['id'],
    },
  },
];

function toInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

function toRange(min: unknown, max: unknown): NumberRange | undefined {
  const range = { min: toInt(min), max: toInt(max) };
  if (range.min === undefined && range.max === undefined) return undefined;
  if (range.min !== undefined && range.max !== undefined && range.min >= range.max) return undefined;
  return range;
}

/** Model arguments to listing filters; anything unknown is dropped. */
export function toFilters(args: Record<string, unknown>): Partial<RoomFilters> {
  const place = typeof args.place === 'string' && placeBySlug(args.place) ? args.place : undefined;
  const amenities = Array.isArray(args.amenities)
    ? [...new Set(args.amenities.filter((slug): slug is string => typeof slug === 'string' && !!amenityBySlug(slug)))].sort()
    : [];
  const sort = ROOM_SORTS.includes(args.sort as RoomSort) ? (args.sort as RoomSort) : undefined;
  return {
    place,
    price: toRange(args.priceMin, args.priceMax),
    area: toRange(args.areaMin, args.areaMax),
    amenities,
    sort,
  };
}

export function toCard(room: Room): ChatRoomCard {
  const cover = room.photos[0];
  return {
    id: room.id,
    title: room.title,
    price: formatPrice(room.price),
    area: formatArea(room.area),
    place: formatPlace(room),
    url: `/phong/${encodeURIComponent(room.id)}`,
    thumb: cover ? { src: photoUrl(cover.thumbKey), ...thumbSize(cover) } : undefined,
  };
}

/** Public details for the model. No landlord fields. */
export function roomDetails(room: Room): Record<string, unknown> {
  return {
    id: room.id,
    title: room.title,
    price: formatPrice(room.price),
    deposit: room.deposit > 0 ? formatPrice(room.deposit) : 'Không cần cọc',
    area: formatArea(room.area),
    street: room.address,
    place: formatPlace(room),
    monthlyCosts: formatUtilities(room.utilities),
    amenities: room.amenities,
    description: room.description.slice(0, 1500),
    url: `/phong/${room.id}`,
  };
}

export async function runTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  if (name === 'search_rooms') {
    const filters = toFilters(args);
    const result = await searchRooms(filters, SEARCH_LIMIT);
    const listingUrl = `/phong${roomFiltersToQuery(filters)}`;
    return {
      response: {
        total: result.total,
        shown: result.rooms.length,
        rooms: result.rooms.map((room) => ({
          id: room.id,
          title: room.title,
          price: formatPrice(room.price),
          area: formatArea(room.area),
          place: formatPlace(room),
          amenities: room.amenities,
        })),
      },
      cards: result.rooms.map(toCard),
      listingUrl,
      total: result.total,
    };
  }

  if (name === 'get_room') {
    const id = typeof args.id === 'string' ? args.id : '';
    const room = ROOM_ID_PATTERN.test(id) ? await getRoomById(id) : undefined;
    if (!room) return { response: { error: 'Không tìm thấy phòng hoặc phòng không còn trống.' }, cards: [] };
    return { response: roomDetails(room), cards: [toCard(room)] };
  }

  return { response: { error: `Không có công cụ ${name}.` }, cards: [] };
}
