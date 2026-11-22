/**
 * Administrative locations. Since 1 July 2025 Vietnam has two levels:
 * province -> ward/commune. This site covers the former Quy Nhơn city, now
 * part of Gia Lai province.
 *
 * - `ward`: the official unit (phường/xã) a room is in. Required.
 * - `neighborhood` ("Khu vực quen gọi"): a former ward name people still use
 *   day to day (Ghềnh Ráng, Lê Lợi...). Optional, always inside one `ward`.
 *
 * Sources for the mapping (verify before relying on it legally):
 * - Nghị quyết 1664/NQ-UBTVQH15 (16/6/2025), Điều 1 khoản 102–106 create the
 *   five Quy Nhơn wards; khoản 127 lists xã Nhơn Châu among units not rearranged.
 * - Nghị quyết 1257/NQ-UBTVQH15 (effective 1/12/2024) had already merged
 *   Lê Hồng Phong and Lý Thường Kiệt into phường Trần Phú, and Trần Hưng Đạo
 *   and Lê Lợi into phường Thị Nại (pairing taken from press reports, not the
 *   resolution text itself). Those names are still listed because renters use them.
 *
 * This file is the only place that knows the mapping. Display and filters go
 * through the helpers below.
 */
import { slugify } from './slug';

/** Fixed province for every room. Not part of the landlord form. */
export const PROVINCE = 'Gia Lai';

export type WardKind = 'phuong' | 'xa';

export interface Neighborhood {
  name: string;
  slug: string;
}

export interface Ward {
  /** Official name without the unit prefix, e.g. `Quy Nhơn Nam`. */
  name: string;
  slug: string;
  kind: WardKind;
  /** Former wards/communes now inside this ward, in display order. */
  neighborhoods: Neighborhood[];
}

const ward = (name: string, kind: WardKind, neighborhoods: string[]): Ward => ({
  name,
  slug: slugify(name),
  kind,
  neighborhoods: neighborhoods.map((n) => ({ name: n, slug: slugify(n) })),
});

export const WARDS: Ward[] = [
  // NQ 1664 khoản 102: Đống Đa (TP Quy Nhơn), Hải Cảng, Thị Nại, Trần Phú.
  // Lê Lợi, Trần Hưng Đạo (-> Thị Nại) and Lê Hồng Phong, Lý Thường Kiệt (-> Trần Phú) via NQ 1257.
  ward('Quy Nhơn', 'phuong', [
    'Trần Phú',
    'Lê Lợi',
    'Lê Hồng Phong',
    'Lý Thường Kiệt',
    'Trần Hưng Đạo',
    'Thị Nại',
    'Hải Cảng',
    'Đống Đa',
  ]),
  // khoản 105: Ngô Mây (TP Quy Nhơn), Nguyễn Văn Cừ, Quang Trung, Ghềnh Ráng.
  ward('Quy Nhơn Nam', 'phuong', ['Nguyễn Văn Cừ', 'Ngô Mây', 'Quang Trung', 'Ghềnh Ráng']),
  // khoản 106: Trần Quang Diệu, Nhơn Phú.
  ward('Quy Nhơn Bắc', 'phuong', ['Trần Quang Diệu', 'Nhơn Phú']),
  // khoản 103: phường Nhơn Bình, xã Nhơn Hội, Nhơn Lý, Nhơn Hải.
  ward('Quy Nhơn Đông', 'phuong', ['Nhơn Bình', 'Nhơn Hội', 'Nhơn Lý', 'Nhơn Hải']),
  // khoản 104: phường Bùi Thị Xuân, xã Phước Mỹ.
  ward('Quy Nhơn Tây', 'phuong', ['Bùi Thị Xuân', 'Phước Mỹ']),
  // khoản 127: not rearranged.
  ward('Nhơn Châu', 'xa', []),
];

const wardsByName = new Map(WARDS.map((w) => [w.name, w]));
const wardsBySlug = new Map(WARDS.map((w) => [w.slug, w]));
const neighborhoodsBySlug = new Map(
  WARDS.flatMap((w) => w.neighborhoods.map((n) => [n.slug, { ward: w, neighborhood: n }] as const)),
);

export function wardByName(name: string): Ward | undefined {
  return wardsByName.get(name);
}

/** True when `neighborhood` is one of the names listed under `wardName`. */
export function isNeighborhoodOf(wardName: string, neighborhood: string): boolean {
  return wardByName(wardName)?.neighborhoods.some((n) => n.name === neighborhood) ?? false;
}

/** `P. Quy Nhơn Nam`, `X. Nhơn Châu`. Unknown names are returned as they are. */
export function wardShortLabel(name: string): string {
  const kind = wardByName(name)?.kind;
  return kind ? `${kind === 'xa' ? 'X.' : 'P.'} ${name}` : name;
}

/** `phường Quy Nhơn Nam`, `xã Nhơn Châu`, for running text. */
export function wardLongLabel(name: string): string {
  const kind = wardByName(name)?.kind;
  return kind ? `${kind === 'xa' ? 'xã' : 'phường'} ${name}` : name;
}

/** `Ghềnh Ráng, P. Quy Nhơn Nam`, or `P. Quy Nhơn Nam` without a neighborhood. */
export function formatPlace(place: { ward: string; neighborhood: string | null }): string {
  const ward = wardShortLabel(place.ward);
  return place.neighborhood ? `${place.neighborhood}, ${ward}` : ward;
}

/** What a `khu-vuc` filter slug points at: a whole ward or one neighborhood. */
export type PlaceMatch = { kind: 'ward'; ward: Ward } | { kind: 'neighborhood'; ward: Ward; neighborhood: Neighborhood };

/** Ward and neighborhood slugs never collide (checked below), so one param covers both. */
export function placeBySlug(slug: string): PlaceMatch | undefined {
  const w = wardsBySlug.get(slug);
  if (w) return { kind: 'ward', ward: w };
  const hit = neighborhoodsBySlug.get(slug);
  return hit && { kind: 'neighborhood', ...hit };
}

/** Label for a filter slug: `P. Quy Nhơn Nam` or `Ghềnh Ráng, P. Quy Nhơn Nam`. */
export function placeLabel(slug: string): string | undefined {
  const match = placeBySlug(slug);
  if (!match) return undefined;
  return match.kind === 'ward'
    ? wardShortLabel(match.ward.name)
    : formatPlace({ ward: match.ward.name, neighborhood: match.neighborhood.name });
}

// Guard against a future edit that makes one slug ambiguous.
{
  const seen = new Set<string>();
  for (const slug of [...wardsBySlug.keys(), ...WARDS.flatMap((w) => w.neighborhoods.map((n) => n.slug))]) {
    if (seen.has(slug)) throw new Error(`Duplicate location slug: ${slug}`);
    seen.add(slug);
  }
}
