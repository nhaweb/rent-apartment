/**
 * Better Auth error codes to Vietnamese messages. Raw errors are never shown.
 */
import { INVALID_LANDLORD_PROFILE } from './create-auth';

export const GENERIC_AUTH_ERROR = 'Đã có lỗi xảy ra. Vui lòng thử lại sau ít phút.';
export const RATE_LIMIT_ERROR = 'Bạn thử quá nhiều lần. Vui lòng đợi một lát rồi thử lại.';

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'Email hoặc mật khẩu không đúng',
  INVALID_EMAIL: 'Email không hợp lệ',
  INVALID_PASSWORD: 'Email hoặc mật khẩu không đúng',
  USER_ALREADY_EXISTS: 'Email này đã được đăng ký',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'Email này đã được đăng ký',
  PASSWORD_TOO_SHORT: 'Mật khẩu quá ngắn',
  PASSWORD_TOO_LONG: 'Mật khẩu quá dài',
  INVALID_TOKEN: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
  TOKEN_EXPIRED: 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn',
  [INVALID_LANDLORD_PROFILE]: 'Thông tin chủ phòng không hợp lệ',
};

/**
 * Picks the Vietnamese message for a failed auth call. Our own
 * INVALID_LANDLORD_PROFILE error already carries a Vietnamese message.
 */
export function authErrorMessage(status: number, code: string | undefined, message?: string): string {
  if (status === 429) return RATE_LIMIT_ERROR;
  if (code === INVALID_LANDLORD_PROFILE && message) return message;
  return (code && MESSAGES[code]) || GENERIC_AUTH_ERROR;
}
