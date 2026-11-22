import type { RoomStatus } from '../types';

/** Dashboard labels for each room status (same words as `Badge.astro`). */
export const ROOM_STATUS_LABELS: Record<RoomStatus, string> = {
  available: 'Còn trống',
  rented: 'Đã thuê',
  hidden: 'Đang ẩn',
};

/** One line on what each status means for renters, shown in the room form. */
export const ROOM_STATUS_HINTS: Record<RoomStatus, string> = {
  available: 'Hiện trên trang tìm phòng, người thuê gửi yêu cầu được.',
  rented: 'Không hiện công khai. Dùng khi phòng đã có người thuê.',
  hidden: 'Không hiện công khai. Chỉ bạn thấy trong trang quản lý.',
};
