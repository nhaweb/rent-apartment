/**
 * Contact request queries, bound to a DB by `createContactRequests(db)`.
 * App code imports the bound functions from `contact-requests.ts`; the
 * ownership test binds its own DB. Keep this file free of `astro:*` imports.
 *
 * Renters (no account) create requests, only for `available` rooms. Landlords
 * read and update requests on their own rooms only: every landlord query puts
 * `rooms.landlord_id = landlordId` in the SQL, so someone else's request looks
 * missing.
 */
import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { ContactRequest, ContactRequestStatus } from '../types';
import { CONTACT_REQUEST_STATUSES } from '../types';
import type { Db } from './db/create-db';
import { contactRequests, landlords, rooms } from './db/schema';
import type { ContactRequestInput } from './validation/contact-request';

/** A second request for the same room from the same phone within this window is not stored. */
const DUPLICATE_WINDOW = '24 hours';

export const CONTACT_INBOX_PAGE_SIZE = 20;

export type CreateContactResult =
  | { status: 'created'; request: ContactRequest; notify: ContactNotification }
  | { status: 'duplicate' }
  | { status: 'not-found' };

/** What the landlord email needs. */
export interface ContactNotification {
  landlordEmail: string;
  landlordName: string;
  roomTitle: string;
}

export interface InboxItem extends ContactRequest {
  roomTitle: string;
}

export interface InboxPage {
  items: InboxItem[];
  /** Matching the status filter. */
  total: number;
  page: number;
  pageCount: number;
  /** Per status, regardless of the filter (for the tabs). */
  counts: Record<ContactRequestStatus, number>;
}

type ContactRow = typeof contactRequests.$inferSelect;

function toContactRequest(row: ContactRow): ContactRequest {
  return {
    id: row.id,
    roomId: row.roomId,
    renterName: row.renterName,
    renterPhone: row.renterPhone,
    message: row.message,
    ...(row.preferredViewingTime ? { preferredViewingTime: row.preferredViewingTime } : {}),
    status: row.status,
    createdAt: row.createdAt,
  };
}

/** `exists (the request's room belongs to landlordId)`. */
const ownedBy = (landlordId: string) =>
  sql`exists (select 1 from ${rooms} where ${rooms.id} = ${contactRequests.roomId} and ${rooms.landlordId} = ${landlordId})`;

export function createContactRequests(db: Db) {
  /**
   * Stores a renter's request in one statement that also checks the room is
   * `available` and that the same phone has not asked about it recently.
   */
  async function createContactRequest(input: ContactRequestInput): Promise<CreateContactResult> {
    const id = crypto.randomUUID();
    const inserted = await db.execute<{ id: string }>(sql`
      insert into ${contactRequests} (id, room_id, renter_name, renter_phone, message, preferred_viewing_time)
      select ${id}, ${rooms.id}, ${input.renterName}, ${input.renterPhone}, ${input.message}, ${input.preferredViewingTime ?? null}
      from ${rooms}
      where ${rooms.id} = ${input.roomId} and ${rooms.status} = 'available'
        and not exists (
          select 1 from ${contactRequests}
          where room_id = ${input.roomId} and renter_phone = ${input.renterPhone}
            and created_at > now() - interval '${sql.raw(DUPLICATE_WINDOW)}'
        )
      returning id`);

    if (inserted.rows.length === 0) {
      const [room] = await db
        .select({ id: rooms.id })
        .from(rooms)
        .where(and(eq(rooms.id, input.roomId), eq(rooms.status, 'available')))
        .limit(1);
      return room ? { status: 'duplicate' } : { status: 'not-found' };
    }

    const [row] = await db
      .select({
        request: contactRequests,
        roomTitle: rooms.title,
        landlordEmail: landlords.email,
        landlordName: landlords.name,
      })
      .from(contactRequests)
      .innerJoin(rooms, eq(contactRequests.roomId, rooms.id))
      .innerJoin(landlords, eq(rooms.landlordId, landlords.id))
      .where(eq(contactRequests.id, id))
      .limit(1);
    return {
      status: 'created',
      request: toContactRequest(row!.request),
      notify: { landlordEmail: row!.landlordEmail, landlordName: row!.landlordName, roomTitle: row!.roomTitle },
    };
  }

  /** The landlord's requests, newest first, optionally one status. */
  async function listOwnContactRequests(
    landlordId: string,
    options: { status?: ContactRequestStatus; page?: number } = {},
  ): Promise<InboxPage> {
    const mine = eq(rooms.landlordId, landlordId);
    const byStatus = await db
      .select({ status: contactRequests.status, count: count() })
      .from(contactRequests)
      .innerJoin(rooms, eq(contactRequests.roomId, rooms.id))
      .where(mine)
      .groupBy(contactRequests.status);
    const counts = Object.fromEntries(CONTACT_REQUEST_STATUSES.map((status) => [status, 0])) as Record<
      ContactRequestStatus,
      number
    >;
    for (const row of byStatus) counts[row.status] = row.count;

    const total = options.status ? counts[options.status] : byStatus.reduce((sum, row) => sum + row.count, 0);
    const pageCount = Math.max(1, Math.ceil(total / CONTACT_INBOX_PAGE_SIZE));
    const page = Math.min(Math.max(1, options.page ?? 1), pageCount);

    const rows = await db
      .select({ request: contactRequests, roomTitle: rooms.title })
      .from(contactRequests)
      .innerJoin(rooms, eq(contactRequests.roomId, rooms.id))
      .where(and(mine, options.status ? eq(contactRequests.status, options.status) : undefined))
      .orderBy(desc(contactRequests.createdAt), desc(contactRequests.id))
      .limit(CONTACT_INBOX_PAGE_SIZE)
      .offset((page - 1) * CONTACT_INBOX_PAGE_SIZE);

    return {
      items: rows.map((row) => ({ ...toContactRequest(row.request), roomTitle: row.roomTitle })),
      total,
      page,
      pageCount,
      counts,
    };
  }

  /** `false` when the request is missing or on someone else's room. */
  async function setOwnContactRequestStatus(
    landlordId: string,
    requestId: string,
    status: ContactRequestStatus,
  ): Promise<boolean> {
    const updated = await db
      .update(contactRequests)
      .set({ status })
      .where(and(eq(contactRequests.id, requestId), ownedBy(landlordId)))
      .returning({ id: contactRequests.id });
    return updated.length > 0;
  }

  return { createContactRequest, listOwnContactRequests, setOwnContactRequestStatus };
}

export type ContactRequests = ReturnType<typeof createContactRequests>;
