import { z } from 'astro/zod';
import { vnPhoneSchema } from './phone';

/** Better Auth's default limits (`minPasswordLength` / `maxPasswordLength`). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: 'Email không hợp lệ' }));

const newPasswordSchema = z
  // Astro passes null for an empty field.
  .string({ error: 'Vui lòng nhập mật khẩu' })
  .min(PASSWORD_MIN_LENGTH, { error: `Mật khẩu cần ít nhất ${PASSWORD_MIN_LENGTH} ký tự` })
  .max(PASSWORD_MAX_LENGTH, { error: `Mật khẩu tối đa ${PASSWORD_MAX_LENGTH} ký tự` });

/** Empty string from an untouched optional form field becomes `undefined`. */
/** An existing password: no length rule beyond the hashing cap. */
const currentPasswordSchema = (message: string) =>
  z
    .string({ error: message })
    .min(1, { error: message })
    .max(PASSWORD_MAX_LENGTH, { error: 'Mật khẩu không đúng' });

/** `next` redirect path; `safeNextPath` checks the value itself. */
const nextPathSchema = z.string().max(512).optional();

const optionalPhoneSchema = z
  .string()
  .trim()
  .transform((value) => (value === '' ? undefined : value))
  .pipe(vnPhoneSchema.optional());

/** Field error when "Cho người thuê nhắn Zalo" is checked without a number. */
export const ZALO_PUBLIC_NEEDS_NUMBER = 'Nhập số Zalo để bật mục này';

/**
 * Landlord profile fields collected on sign-up, besides the credentials.
 * `zaloPublic`: the "Cho người thuê nhắn Zalo cho tôi từ trang phòng" checkbox
 * (unchecked = absent from the form = false).
 */
export const landlordProfileSchema = z.object({
  phone: vnPhoneSchema,
  zalo: optionalPhoneSchema.optional(),
  zaloPublic: z.boolean().default(false),
});

/** The opt-in needs a Zalo number. Applied to every schema that has both fields. */
function zaloOptInNeedsNumber(data: { zalo?: string; zaloPublic: boolean }, ctx: z.RefinementCtx) {
  if (data.zaloPublic && !data.zalo) {
    ctx.addIssue({ code: 'custom', message: ZALO_PUBLIC_NEEDS_NUMBER, path: ['zaloPublic'] });
  }
}

export const nameSchema = z
  .string({ error: 'Vui lòng nhập họ tên' })
  .trim()
  .min(1, { error: 'Vui lòng nhập họ tên' })
  .max(100, { error: 'Họ tên tối đa 100 ký tự' });

export const signUpSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: newPasswordSchema,
    ...landlordProfileSchema.shape,
    /** Path to continue to after sign-up (e.g. "Đăng phòng"). Checked by `safeNextPath`. */
    next: nextPathSchema,
  })
  .superRefine(zaloOptInNeedsNumber);

/** The sign-up body the Better Auth user hook reads (`create-auth.ts`). */
export const landlordSignUpProfileSchema = landlordProfileSchema.superRefine(zaloOptInNeedsNumber);

export const signInSchema = z.object({
  email: emailSchema,
  password: currentPasswordSchema('Vui lòng nhập mật khẩu'),
  /** Path to return to after sign-in. Checked again by `safeNextPath`. */
  next: nextPathSchema,
});

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z
      .string()
      .min(1, { error: 'Liên kết đặt lại mật khẩu không hợp lệ' })
      .max(256, { error: 'Liên kết đặt lại mật khẩu không hợp lệ' }),
    password: newPasswordSchema,
    confirmPassword: z.string().max(PASSWORD_MAX_LENGTH),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Mật khẩu nhập lại không khớp',
    path: ['confirmPassword'],
  });

/** `/quan-ly/tai-khoan`: name and contact numbers (email cannot change yet). */
export const updateProfileSchema = z
  .object({
    name: nameSchema,
    ...landlordProfileSchema.shape,
  })
  .superRefine(zaloOptInNeedsNumber);

export const changePasswordSchema = z
  .object({
    currentPassword: currentPasswordSchema('Vui lòng nhập mật khẩu hiện tại'),
    password: newPasswordSchema,
    confirmPassword: z.string({ error: 'Vui lòng nhập lại mật khẩu mới' }).max(PASSWORD_MAX_LENGTH),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: 'Mật khẩu nhập lại không khớp',
    path: ['confirmPassword'],
  });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type LandlordProfileInput = z.infer<typeof landlordProfileSchema>;

/** Word the landlord types to confirm account deletion. */
export const DELETE_ACCOUNT_CONFIRM_WORD = 'XÓA';

/** `/quan-ly/tai-khoan` "Xóa tài khoản": current password + the confirm word. */
export const deleteAccountSchema = z.object({
  password: currentPasswordSchema('Vui lòng nhập mật khẩu hiện tại'),
  confirm: z
    .string({ error: `Gõ ${DELETE_ACCOUNT_CONFIRM_WORD} để xác nhận` })
    .trim()
    .max(20)
    .refine((value) => value.normalize('NFC').toUpperCase() === DELETE_ACCOUNT_CONFIRM_WORD.normalize('NFC'), {
      error: `Gõ ${DELETE_ACCOUNT_CONFIRM_WORD} để xác nhận`,
    }),
});

/** "Đăng xuất thiết bị này" on the device list (a session id, never a token). */
export const revokeSessionSchema = z.object({
  sessionId: z.string().trim().min(1).max(100),
});
