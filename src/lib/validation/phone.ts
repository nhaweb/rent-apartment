import { z } from 'astro/zod';

/**
 * Vietnamese mobile number: 0 or +84/84 prefix, then a mobile network
 * prefix (3, 5, 7, 8, 9) and 8 more digits. Spaces, dots and dashes are
 * stripped. Output is normalized to the local form `0xxxxxxxxx`.
 */
const VN_MOBILE_REGEX = /^(?:\+?84|0)([35789]\d{8})$/;

export const vnPhoneSchema = z
  .string({ error: 'Vui lòng nhập số điện thoại' })
  .trim()
  .transform((value) => value.replace(/[\s.-]/g, ''))
  .pipe(z.string().regex(VN_MOBILE_REGEX, { error: 'Số điện thoại không hợp lệ' }))
  .transform((value) => value.replace(VN_MOBILE_REGEX, '0$1'));

/**
 * HTML `pattern` for phone inputs: the same rule as `vnPhoneSchema`, with the
 * separators it strips (spaces, dots, dashes). Server validation still runs.
 */
export const VN_PHONE_INPUT_PATTERN = String.raw`(\+?84|0)[\s.\-]*[35789]([\s.\-]*[0-9]){8}`;
export const VN_PHONE_INPUT_TITLE = 'Số di động Việt Nam, 10 số, bắt đầu bằng 03, 05, 07, 08 hoặc 09';
