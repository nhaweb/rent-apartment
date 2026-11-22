/** Shared checks for the dashboard actions. */
import { ActionError, type ActionAPIContext } from 'astro:actions';
import { getCurrentLandlord } from '../lib/auth';

/** The signed-in landlord's id. The middleware guards pages, not `/_actions/*`, so every action calls this. */
export async function requireLandlordId(context: ActionAPIContext): Promise<string> {
  const landlord = await getCurrentLandlord(context);
  if (!landlord) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập lại.' });
  return landlord.id;
}

/** Missing room and someone else's room get the same answer. */
export function notFound(): never {
  throw new ActionError({ code: 'NOT_FOUND', message: 'Không tìm thấy phòng này.' });
}

export const NEEDS_PHOTO_MESSAGE = 'Phòng cần ít nhất 1 ảnh để hiện công khai. Hãy thêm ảnh, hoặc chọn “Đang ẩn”.';

export const NEEDS_VERIFICATION_MESSAGE =
  'Hãy xác thực email trước khi cho phòng hiện công khai. Mở liên kết trong email chúng tôi đã gửi, hoặc gửi lại ở trang Tổng quan.';
