/**
 * Search engine rules for public pages: which URL is canonical, which pages
 * stay out of the index, meta descriptions, and JSON-LD (schema.org).
 * Absolute URLs come from `Astro.site` (`PUBLIC_SITE_URL`), never the request host.
 */
import type { Room } from '../types';
import { formatPlace, PROVINCE, wardShortLabel } from './locations';
import { photoUrl } from './photo-urls';
import { slugify } from './slug';
import { roomFiltersToQuery, type RoomFilters } from './validation/room-filters';

/**
 * `/phong` canonical: the ward/neighborhood page and its page number are
 * worth indexing; price, area, amenity and sort variants point back to it.
 */
export function listingCanonicalPath(filters: Partial<RoomFilters>, page: number): string {
  return `/phong${roomFiltersToQuery({ place: filters.place, page })}`;
}

/** Only the plain listing (optionally per place) with results is indexed; filter combinations are not. */
export function isIndexableListing(filters: Partial<RoomFilters>, total: number): boolean {
  return total > 0 && !filters.price && !filters.area && !filters.amenities?.length;
}

/** One line, at most `max` characters, cut at a word boundary. */
export function truncateText(text: string, max = 160): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  const cut = line.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

export type JsonLd = Record<string, unknown>;

export interface Crumb {
  name: string;
  /** Root-relative path. */
  path: string;
}

const absolute = (path: string, site: URL) => new URL(path, site).href;

export function breadcrumbJsonLd(crumbs: Crumb[], site: URL): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absolute(crumb.path, site),
    })),
  };
}

export function websiteJsonLd(name: string, site: URL): JsonLd {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name, url: site.href, inLanguage: 'vi' };
}

/** Breadcrumb trail of a room page: listing, ward, then the neighborhood when set. */
export function roomCrumbs(room: Pick<Room, 'title' | 'id' | 'ward' | 'neighborhood'>): Crumb[] {
  const wardPath = `/phong${roomFiltersToQuery({ place: slugify(room.ward) })}`;
  return [
    { name: 'Phòng cho thuê', path: '/phong' },
    { name: wardShortLabel(room.ward), path: wardPath },
    ...(room.neighborhood
      ? [{ name: room.neighborhood, path: `/phong${roomFiltersToQuery({ place: slugify(room.neighborhood) })}` }]
      : []),
    { name: room.title, path: `/phong/${encodeURIComponent(room.id)}` },
  ];
}

/**
 * A public room as `Accommodation` with its monthly rent as an `Offer`.
 * Street and approximate pin only (no house number); never landlord details.
 */
export function roomJsonLd(room: Room, site: URL): JsonLd {
  const url = absolute(`/phong/${encodeURIComponent(room.id)}`, site);
  return {
    '@context': 'https://schema.org',
    '@type': 'Accommodation',
    '@id': url,
    url,
    name: room.title,
    ...(room.description ? { description: truncateText(room.description, 500) } : {}),
    image: room.photos.slice(0, 5).map((photo) => photoUrl(photo.key)),
    floorSize: { '@type': 'QuantitativeValue', value: room.area, unitCode: 'MTK' },
    address: {
      '@type': 'PostalAddress',
      streetAddress: room.address,
      addressLocality: formatPlace(room),
      addressRegion: PROVINCE,
      addressCountry: 'VN',
    },
    ...(room.location ? { geo: { '@type': 'GeoCoordinates', latitude: room.location.lat, longitude: room.location.lng } } : {}),
    offers: {
      '@type': 'Offer',
      url,
      price: room.price,
      priceCurrency: 'VND',
      availability: room.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
      priceSpecification: {
        '@type': 'UnitPriceSpecification',
        price: room.price,
        priceCurrency: 'VND',
        unitCode: 'MON',
        unitText: 'tháng',
      },
    },
  };
}
