/**
 * Amenity catalog. `Room.amenities` stores the Vietnamese labels; this maps
 * each known label to a URL slug (for the `tien-ich` filter), an icon, and,
 * for a few, a short highlight shown on the room detail page.
 *
 * Labels not in this list still display (with the generic `check` icon) but
 * cannot be filtered on until they are added here.
 */
import type { IconName } from '../components/ui/icons';
import { slugify } from './slug';

export interface AmenityInfo {
  label: string;
  slug: string;
  icon: IconName;
  /** Shown in the category bar on home and listing pages. */
  category?: boolean;
  /** One-line explanation for the detail page "highlights" block. */
  highlight?: string;
}

const define = (label: string, icon: IconName, extra: Partial<AmenityInfo> = {}): AmenityInfo => ({
  label,
  slug: slugify(label),
  icon,
  ...extra,
});

/** Order matters: category bar and highlights follow it. */
export const AMENITIES: AmenityInfo[] = [
  define('Không chung chủ', 'key', { category: true, highlight: 'Lối đi và chìa khóa riêng, không ở chung với chủ nhà.' }),
  define('Đầy đủ nội thất', 'sofa', { category: true, highlight: 'Có sẵn giường, tủ và bếp, chỉ cần mang đồ cá nhân.' }),
  define('Ban công', 'sun', { category: true, highlight: 'Phòng thoáng, có chỗ hóng gió và phơi đồ.' }),
  define('Bếp riêng', 'cookingPot', { category: true, highlight: 'Tự nấu ăn trong phòng, không phải dùng bếp chung.' }),
  define('Giờ giấc tự do', 'clock', { category: true, highlight: 'Ra vào giờ nào cũng được, không khóa cổng.' }),
  define('Bao điện nước', 'zap', { category: true, highlight: 'Giá thuê đã gồm tiền điện và nước.' }),
  define('Cho nuôi thú cưng', 'pawPrint', { category: true, highlight: 'Chủ phòng đồng ý cho nuôi chó, mèo.' }),
  define('Máy giặt riêng', 'washingMachine', { category: true }),
  define('Thang máy', 'arrowUpDown', { category: true }),
  define('Máy lạnh', 'snowflake', { category: true }),
  define('Nóng lạnh', 'showerHead'),
  define('Wifi', 'wifi'),
  define('Tủ lạnh', 'refrigerator'),
  define('Máy giặt chung', 'washingMachine'),
  define('Bếp chung', 'cookingPot'),
  define('Nội thất cơ bản', 'bed'),
  define('Chỗ để xe', 'bike'),
  define('Sân phơi', 'shirt'),
  define('Camera an ninh', 'video'),
];

const byLabel = new Map(AMENITIES.map((amenity) => [amenity.label, amenity]));
const bySlug = new Map(AMENITIES.map((amenity) => [amenity.slug, amenity]));

/** Catalog entry for a stored label; unknown labels get a generic entry. */
export function amenityInfo(label: string): AmenityInfo {
  return byLabel.get(label) ?? { label, slug: slugify(label), icon: 'check' };
}

export function amenityBySlug(slug: string): AmenityInfo | undefined {
  return bySlug.get(slug);
}

/** Up to `limit` amenities with a highlight, in catalog order. */
export function roomHighlights(labels: string[], limit = 3): AmenityInfo[] {
  const owned = new Set(labels);
  return AMENITIES.filter((amenity) => amenity.highlight && owned.has(amenity.label)).slice(0, limit);
}

/** Short tags for a card: the most distinctive amenities, in catalog order. */
export function cardTags(labels: string[], limit = 2): string[] {
  const owned = new Set(labels);
  return AMENITIES.filter((amenity) => amenity.category && owned.has(amenity.label))
    .slice(0, limit)
    .map((amenity) => amenity.label);
}
