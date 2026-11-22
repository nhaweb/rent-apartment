import { z } from 'astro/zod';
import type { ContactRequest } from '../../types';
import { CONTACT_REQUEST_STATUSES } from '../../types';
import { vnPhoneSchema } from './phone';
import { ROOM_ID_PATTERN } from './room';

/** Fields a renter submits from the room detail contact form. */
export const contactRequestInputSchema = z.object({
  roomId: z.string().trim().regex(ROOM_ID_PATTERN, { error: 'Thiếu mã phòng' }),
  renterName: z
    // An empty field arrives as null from Astro's form parser.
    .string({ error: 'Vui lòng nhập họ tên' })
    .trim()
    .min(1, { error: 'Vui lòng nhập họ tên' })
    .max(100, { error: 'Họ tên tối đa 100 ký tự' }),
  renterPhone: vnPhoneSchema,
  // Astro's form parser turns an empty, non-optional field into null.
  message: z.preprocess(
    (value) => value ?? '',
    z.string().trim().max(1000, { error: 'Lời nhắn tối đa 1000 ký tự' }),
  ),
  // An empty field is "not given" (stored as null), not "".
  // `.optional()` outside the preprocess, so a missing field is allowed too.
  preferredViewingTime: z
    .preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string().trim().max(100, { error: 'Thời gian xem phòng tối đa 100 ký tự' }).optional(),
    )
    .optional(),
});

export type ContactRequestInput = z.infer<typeof contactRequestInputSchema>;

/** Name of the hidden honeypot field. People leave it empty; simple bots fill it. */
export const CONTACT_HONEYPOT_FIELD = 'website';

/** The form as posted: the input plus the honeypot. */
export const contactFormSchema = contactRequestInputSchema.extend({
  [CONTACT_HONEYPOT_FIELD]: z.string().max(500).optional(),
});

export const contactRequestStatusSchema = z.enum(CONTACT_REQUEST_STATUSES, { error: 'Trạng thái không hợp lệ' });

/** Landlord changes the status of one request (dashboard inbox). */
export const setContactRequestStatusSchema = z.object({
  id: z.string().trim().min(1).max(64),
  status: contactRequestStatusSchema,
});

type ServerManagedContactFields = 'id' | 'status' | 'createdAt';

// Compile-time guard: schema output must stay in sync with the ContactRequest type.
type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const _contactInputMatchesType: AssertEqual<
  ContactRequestInput,
  Omit<ContactRequest, ServerManagedContactFields>
> = true;
void _contactInputMatchesType;
