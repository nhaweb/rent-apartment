/**
 * Contact requests for app code: queries bound to the app DB (see
 * `contact-requests-core.ts`) plus the landlord notification email.
 */
import { PUBLIC_SITE_URL } from 'astro:env/client';
import type { ContactRequest } from '../types';
import { createContactRequests, type ContactNotification } from './contact-requests-core';
import { db } from './db/client';
import { sendEmail } from './email';
import { newContactRequest } from './email/templates';

export type { CreateContactResult, InboxItem, InboxPage } from './contact-requests-core';
export { CONTACT_INBOX_PAGE_SIZE } from './contact-requests-core';

export const { createContactRequest, listOwnContactRequests, setOwnContactRequestStatus } = createContactRequests(db);

export const CONTACT_INBOX_PATH = '/quan-ly/lien-he';

/**
 * Tells the landlord about a new request. Best effort: the request is already
 * saved and shows in the inbox, so a failure is only logged (inside
 * `sendEmail`) and the renter still sees success. No reply-to: renters give a
 * phone number, not an email.
 */
export async function notifyLandlord(request: ContactRequest, notify: ContactNotification): Promise<void> {
  const content = newContactRequest({
    landlordName: notify.landlordName,
    roomTitle: notify.roomTitle,
    renterName: request.renterName,
    renterPhone: request.renterPhone,
    message: request.message,
    preferredViewingTime: request.preferredViewingTime,
    dashboardUrl: new URL(CONTACT_INBOX_PATH, PUBLIC_SITE_URL).href,
  });
  await sendEmail({ to: notify.landlordEmail, ...content });
}
