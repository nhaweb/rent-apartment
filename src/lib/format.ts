import type { RoomUtilities } from '../types';

const numberFormat = new Intl.NumberFormat('vi-VN');
const decimalFormat = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });
/** Dates are shown in Vietnam time, whatever the server's zone (UTC on Vercel/Fly). */
const VN_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const dateFormat = new Intl.DateTimeFormat('vi-VN', { timeZone: VN_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
const vnDay = new Intl.DateTimeFormat('en-CA', { timeZone: VN_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Whole calendar days between two instants, counted in Vietnam time. */
function calendarDaysBetween(from: Date, to: Date): number {
  const day = (date: Date) => Date.parse(`${vnDay.format(date)}T00:00:00Z`);
  return Math.round((day(to) - day(from)) / 86_400_000);
}

/** Full price, e.g. `3.500.000 đ`. Input is an integer in VND. */
export function formatPrice(vnd: number): string {
  return `${numberFormat.format(vnd)} đ`;
}

/** Compact price for cards and filters, e.g. `3,5 triệu`, `900 nghìn`. */
export function formatPriceShort(vnd: number): string {
  if (vnd >= 1_000_000) return `${decimalFormat.format(vnd / 1_000_000)} triệu`;
  if (vnd >= 1_000) return `${numberFormat.format(Math.round(vnd / 1_000))} nghìn`;
  return formatPrice(vnd);
}

/** Area in square meters, e.g. `25 m²`. */
export function formatArea(m2: number): string {
  return `${decimalFormat.format(m2)} m²`;
}

/** "Đăng hôm nay", "Đăng 3 ngày trước", or the date once older than a month. */
export function formatPostedAt(date: Date, now: Date = new Date()): string {
  const days = calendarDaysBetween(date, now);
  if (days <= 0) return 'Đăng hôm nay';
  if (days === 1) return 'Đăng hôm qua';
  if (days < 30) return `Đăng ${days} ngày trước`;
  return `Đăng ngày ${dateFormat.format(date)}`;
}

/** When a room went public (`publishedAt`), falling back to its creation for rooms never published. */
export function postedDate(room: { publishedAt: Date | null; createdAt: Date }): Date {
  return room.publishedAt ?? room.createdAt;
}

/** True for rooms posted within the last `days` days ("Mới đăng" badge). */
export function isRecentlyPosted(date: Date, days = 3, now: Date = new Date()): boolean {
  return now.getTime() - date.getTime() < days * 86_400_000;
}

/** Shortest price, for map markers: `6,5 tr`, `900k`. */
export function formatPriceMarker(vnd: number): string {
  if (vnd >= 1_000_000) return `${decimalFormat.format(vnd / 1_000_000)} tr`;
  if (vnd >= 1_000) return `${numberFormat.format(Math.round(vnd / 1_000))}k`;
  return formatPrice(vnd);
}

/** `0905000001` to `0905 000 001`. Other shapes are returned unchanged. */
export function formatPhone(phone: string): string {
  return /^0\d{9}$/.test(phone) ? `${phone.slice(0, 4)} ${phone.slice(4, 7)} ${phone.slice(7)}` : phone;
}

/** Shown for a utility the landlord left empty. */
export const UTILITY_NEGOTIABLE = 'Thỏa thuận';
/** Shown for a utility priced at 0. */
export const UTILITY_INCLUDED = 'Miễn phí / đã bao gồm';

/** `0` -> included, otherwise the price with its unit suffix. */
function utilityPrice(vnd: number, unit: string): string {
  return vnd === 0 ? UTILITY_INCLUDED : `${formatPrice(vnd)}/${unit}`;
}

/** One row per utility for the "Chi phí hàng tháng" block, in a fixed order. */
export function formatUtilities(utilities: RoomUtilities): { label: string; value: string }[] {
  const { electricity, water, wifi, serviceFee } = utilities;
  return [
    {
      label: 'Điện',
      value: !electricity
        ? UTILITY_NEGOTIABLE
        : electricity.kind === 'state'
          ? 'Giá nhà nước'
          : utilityPrice(electricity.price, 'kWh'),
    },
    {
      label: 'Nước',
      value: !water ? UTILITY_NEGOTIABLE : utilityPrice(water.price, water.unit === 'person' ? 'người/tháng' : 'm³'),
    },
    { label: 'Wifi', value: wifi === null ? UTILITY_NEGOTIABLE : utilityPrice(wifi, 'tháng') },
    { label: 'Phí dịch vụ', value: serviceFee === null ? UTILITY_NEGOTIABLE : utilityPrice(serviceFee, 'tháng') },
  ];
}

/** Dashboard timestamps: Vietnam time too. */
const vnTime = new Intl.DateTimeFormat('vi-VN', { timeZone: VN_TIME_ZONE, hour: '2-digit', minute: '2-digit' });
const vnDate = new Intl.DateTimeFormat('vi-VN', { timeZone: VN_TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });

/** `${prefix} hôm nay, 14:05`, `${prefix} hôm qua, 09:30`, or `${prefix} 03/11/2026`, in Vietnam time. */
function formatDayTime(prefix: string, date: Date, now: Date): string {
  const day = vnDay.format(date);
  if (day === vnDay.format(now)) return `${prefix} hôm nay, ${vnTime.format(date)}`;
  if (day === vnDay.format(new Date(now.getTime() - 86_400_000))) return `${prefix} hôm qua, ${vnTime.format(date)}`;
  return `${prefix} ${vnDate.format(date)}`;
}

/** "Cập nhật hôm nay, 14:05", "Cập nhật hôm qua, 09:30", "Cập nhật 03/11/2026". */
export function formatUpdatedAt(date: Date, now: Date = new Date()): string {
  return formatDayTime('Cập nhật', date, now);
}

/** Contact request time: "Gửi hôm nay, 14:05", "Gửi 03/11/2026". */
export function formatSentAt(date: Date, now: Date = new Date()): string {
  return formatDayTime('Gửi', date, now);
}
