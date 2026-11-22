import type { ContactRequestStatus } from '../types';

/** Dashboard labels for each contact request status. */
export const CONTACT_STATUS_LABELS: Record<ContactRequestStatus, string> = {
  new: 'Mới',
  contacted: 'Đã liên hệ',
  closed: 'Đã xong',
};

/** `?trang-thai=` values on `/quan-ly/lien-he` (Vietnamese slugs, no diacritics). */
export const CONTACT_STATUS_SLUGS: Record<ContactRequestStatus, string> = {
  new: 'moi',
  contacted: 'da-lien-he',
  closed: 'da-xong',
};
