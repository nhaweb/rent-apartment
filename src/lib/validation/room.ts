import { z } from 'astro/zod';
import { ROOM_STATUSES, WATER_UNITS, type Room } from '../../types';
import { AMENITIES, amenityBySlug } from '../amenities';
import { isNeighborhoodOf, wardByName } from '../locations';

/** Form-level limits, also used as HTML attributes in `RoomForm.astro`. */
export const ROOM_LIMITS = {
  title: 150,
  description: 5000,
  address: 255,
  /** VND. Well inside Postgres `integer`. */
  maxMoney: 1_000_000_000,
  maxArea: 1000,
} as const;

/** `3.500.000`, `3 500 000` and `3500000` are all accepted. */
const stripDigitSeparators = (value: unknown) => (typeof value === 'string' ? value.replace(/[\s.,]/g, '') : value);

const requiredText = (max: number, label: string) =>
  z
    .string({ error: `Vui lòng nhập ${label}` })
    .trim()
    .min(1, { error: `Vui lòng nhập ${label}` })
    .max(max, { error: `Tối đa ${max} ký tự` });

/** Required whole number of VND (or m²). Astro passes `null` for an empty field. */
const wholeNumber = (label: string, max: number) =>
  z.preprocess(
    stripDigitSeparators,
    z
      .string({ error: `Vui lòng nhập ${label}` })
      .regex(/^\d{1,10}$/, { error: `${label[0]!.toUpperCase()}${label.slice(1)} chỉ gồm chữ số` })
      .transform(Number)
      .pipe(z.number().max(max, { error: `${label[0]!.toUpperCase()}${label.slice(1)} quá lớn` })),
  );

/** Optional VND amount: empty = `null` ("Thỏa thuận"), 0 = free / included. */
const optionalMoney = (label: string) =>
  z.preprocess(
    (value) => {
      const digits = stripDigitSeparators(value);
      return digits === '' || digits === undefined ? null : digits;
    },
    z
      .string()
      .regex(/^\d{1,10}$/, { error: `${label} chỉ gồm chữ số` })
      .transform(Number)
      .pipe(z.number().max(ROOM_LIMITS.maxMoney, { error: `${label} quá lớn` }))
      .nullable(),
  );

/** Optional select value: empty = `null`. */
const optionalText = (max: number) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? null : value), z.string().trim().max(max).nullable());

export const ELECTRICITY_MODES = ['', 'state', 'per-kwh'] as const;

/**
 * Map pin bounds: the province and its surroundings, generously. A pin far
 * outside is a mistake (or a forged form), not a room in Gia Lai.
 */
export const LOCATION_BOUNDS = { south: 12.3, west: 107, north: 15, east: 110 } as const;

/** Pins are stored to 5 decimals (about 1 m); the landlord places them at street level, not on the house. */
const LOCATION_DECIMALS = 5;

/** Optional coordinate from a hidden input: empty = `null`. */
const optionalCoordinate = (min: number, max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : null),
    z
      .number({ error: 'Vị trí trên bản đồ không hợp lệ' })
      .min(min, { error: 'Vị trí nằm ngoài khu vực' })
      .max(max, { error: 'Vị trí nằm ngoài khu vực' })
      .transform((value) => Number(value.toFixed(LOCATION_DECIMALS)))
      .nullable(),
  );

/** Room form fields as submitted. Field names match the inputs in `RoomForm.astro`. */
const roomFormFields = z.object({
  title: requiredText(ROOM_LIMITS.title, 'tiêu đề'),
  description: z
    .string()
    .trim()
    .max(ROOM_LIMITS.description, { error: `Tối đa ${ROOM_LIMITS.description} ký tự` })
    .nullable()
    .transform((value) => value ?? ''),
  price: wholeNumber('giá thuê', ROOM_LIMITS.maxMoney),
  deposit: wholeNumber('tiền cọc', ROOM_LIMITS.maxMoney),
  area: wholeNumber('diện tích', ROOM_LIMITS.maxArea).refine((value) => value > 0, {
    error: 'Diện tích phải lớn hơn 0',
  }),
  address: requiredText(ROOM_LIMITS.address, 'địa chỉ'),
  ward: z
    .string({ error: 'Vui lòng chọn phường/xã' })
    .refine((value) => wardByName(value) !== undefined, { error: 'Vui lòng chọn phường/xã' }),
  neighborhood: optionalText(100),
  electricityMode: z.preprocess((value) => value ?? '', z.enum(ELECTRICITY_MODES)),
  electricityPrice: optionalMoney('Giá điện'),
  waterPrice: optionalMoney('Giá nước'),
  waterUnit: z.preprocess((value) => value ?? 'm3', z.enum(WATER_UNITS)),
  wifi: optionalMoney('Tiền wifi'),
  serviceFee: optionalMoney('Phí dịch vụ'),
  /** Map pin (hidden inputs set by `<location-picker>`). Both or neither. */
  lat: optionalCoordinate(LOCATION_BOUNDS.south, LOCATION_BOUNDS.north),
  lng: optionalCoordinate(LOCATION_BOUNDS.west, LOCATION_BOUNDS.east),
  /**
   * Amenity slugs (checkbox values); stored as labels. Keep this a plain
   * `z.array(...).default()` with no `.transform()`: Astro only reads every
   * checked box (`getAll`) when it can unwrap the field to `ZodArray`, so a
   * pipe around the default makes it read one string. Deduped in `toRoomInput`.
   */
  amenities: z
    .array(z.string().max(60))
    .max(AMENITIES.length * 2, { error: 'Tiện ích không hợp lệ' })
    .refine((slugs) => slugs.every((slug) => amenityBySlug(slug)), { error: 'Tiện ích không hợp lệ' })
    .default([]),
  /** Not on the create form: new rooms start hidden (no photos yet). */
  status: z.enum(ROOM_STATUSES, { error: 'Trạng thái không hợp lệ' }).default('hidden'),
});

type RoomFormFields = z.output<typeof roomFormFields>;

function checkRoomForm(form: RoomFormFields, ctx: z.RefinementCtx): void {
  if (form.neighborhood && !isNeighborhoodOf(form.ward, form.neighborhood)) {
    ctx.addIssue({ code: 'custom', path: ['neighborhood'], message: 'Khu vực này không thuộc phường/xã đã chọn' });
  }
  if ((form.lat === null) !== (form.lng === null)) {
    ctx.addIssue({ code: 'custom', path: ['lat'], message: 'Vị trí trên bản đồ không hợp lệ' });
  }
  if (form.electricityMode === 'per-kwh' && form.electricityPrice === null) {
    ctx.addIssue({ code: 'custom', path: ['electricityPrice'], message: 'Nhập giá điện mỗi kWh' });
  }
}

function toRoomInput(form: RoomFormFields): RoomInput {
  return {
    title: form.title,
    description: form.description,
    price: form.price,
    deposit: form.deposit,
    area: form.area,
    address: form.address,
    ward: form.ward,
    neighborhood: form.neighborhood,
    location: form.lat !== null && form.lng !== null ? { lat: form.lat, lng: form.lng } : null,
    utilities: {
      electricity:
        form.electricityMode === 'state'
          ? { kind: 'state' }
          : // Without JS the price field is always visible: a price with no mode still counts.
            form.electricityPrice !== null
            ? { kind: 'per-kwh', price: form.electricityPrice }
            : null,
      water: form.waterPrice === null ? null : { price: form.waterPrice, unit: form.waterUnit },
      wifi: form.wifi,
      serviceFee: form.serviceFee,
    },
    amenities: [...new Set(form.amenities)].flatMap((slug) => amenityBySlug(slug)?.label ?? []),
    status: form.status,
  };
}

/** Create form (`/quan-ly/phong/moi`): validated, then turned into the domain shape. */
export const roomFormSchema = roomFormFields.superRefine(checkRoomForm).transform(toRoomInput);

/** Edit form (`/quan-ly/phong/[id]`): the same fields plus the room id. */
export const roomUpdateSchema = roomFormFields
  .extend({ id: z.string().trim().min(1).max(120) })
  .superRefine(checkRoomForm)
  .transform((form) => ({ id: form.id, room: toRoomInput(form) }));

/**
 * Fields a landlord edits in the form. Server-managed fields, the province
 * (fixed) and photos (their own rows and actions) are not in the form.
 */
export type RoomInput = Omit<
  Room,
  'id' | 'landlordId' | 'createdAt' | 'publishedAt' | 'updatedAt' | 'province' | 'photos'
>;

/**
 * Room ids are generated slugs (`newRoomId`: up to ~70 chars). The pattern
 * is for untrusted input outside the dashboard (chat, contact form).
 */
export const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{1,120}$/;
export const roomIdSchema = z.string().trim().regex(ROOM_ID_PATTERN);

export const roomStatusSchema = z.enum(ROOM_STATUSES, { error: 'Trạng thái không hợp lệ' });

/** "Đổi trạng thái" form on the room list. */
export const setRoomStatusSchema = z.object({ id: roomIdSchema, status: roomStatusSchema });

/** "Xóa phòng" confirmation form. */
export const deleteRoomSchema = z.object({ id: roomIdSchema });
