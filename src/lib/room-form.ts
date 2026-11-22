/**
 * Field values for `RoomForm.astro`: from a saved room (edit page) or from the
 * submitted form (refill after a validation error). All strings, as the
 * inputs hold them; `roomFormSchema` parses them on submit.
 */
import type { Room } from '../types';
import { amenityInfo } from './amenities';

export interface RoomFormValues {
  title: string;
  description: string;
  price: string;
  deposit: string;
  area: string;
  address: string;
  ward: string;
  neighborhood: string;
  /** Map pin, empty when not set. */
  lat: string;
  lng: string;
  electricityMode: string;
  electricityPrice: string;
  waterPrice: string;
  waterUnit: string;
  wifi: string;
  serviceFee: string;
  status: string;
  /** Amenity slugs. */
  amenities: string[];
}

const numberFormat = new Intl.NumberFormat('vi-VN');
const money = (vnd: number | null | undefined) => (vnd === null || vnd === undefined ? '' : numberFormat.format(vnd));

/** A new room: hidden until it has photos, water billed per m³. */
export const EMPTY_ROOM_FORM: RoomFormValues = {
  title: '',
  description: '',
  price: '',
  deposit: '',
  area: '',
  address: '',
  ward: '',
  neighborhood: '',
  lat: '',
  lng: '',
  electricityMode: '',
  electricityPrice: '',
  waterPrice: '',
  waterUnit: 'm3',
  wifi: '',
  serviceFee: '',
  status: 'hidden',
  amenities: [],
};

export function roomFormValues(room: Room): RoomFormValues {
  const { electricity, water, wifi, serviceFee } = room.utilities;
  return {
    title: room.title,
    description: room.description,
    price: money(room.price),
    deposit: money(room.deposit),
    area: String(room.area),
    address: room.address,
    ward: room.ward,
    neighborhood: room.neighborhood ?? '',
    lat: room.location ? String(room.location.lat) : '',
    lng: room.location ? String(room.location.lng) : '',
    electricityMode: electricity?.kind ?? '',
    electricityPrice: electricity?.kind === 'per-kwh' ? money(electricity.price) : '',
    waterPrice: money(water?.price),
    waterUnit: water?.unit ?? 'm3',
    wifi: money(wifi),
    serviceFee: money(serviceFee),
    status: room.status,
    amenities: room.amenities.map((label) => amenityInfo(label).slug),
  };
}

/** What the landlord just submitted, or `undefined` for a GET. */
export async function submittedRoomFormValues(request: Request): Promise<RoomFormValues | undefined> {
  if (request.method !== 'POST') return undefined;
  try {
    const form = await request.clone().formData();
    const text = (key: keyof RoomFormValues) => {
      const value = form.get(key);
      return typeof value === 'string' ? value : '';
    };
    return {
      ...EMPTY_ROOM_FORM,
      ...Object.fromEntries(
        (Object.keys(EMPTY_ROOM_FORM) as (keyof RoomFormValues)[])
          .filter((key) => key !== 'amenities')
          .map((key) => [key, text(key)]),
      ),
      waterUnit: text('waterUnit') || 'm3',
      status: text('status') || 'hidden',
      amenities: form.getAll('amenities').filter((value): value is string => typeof value === 'string'),
    };
  } catch {
    return undefined;
  }
}
