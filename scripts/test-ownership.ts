/**
 * Proves a landlord cannot read, edit, change the status of, or delete
 * another landlord's room, nor read or update requests sent for it, nor see or
 * sign out their devices. Run with `npm run test:ownership`.
 *
 * Part A (always): the real queries from `src/lib/landlord-rooms-core.ts`
 * against the database in `.env`, with two throwaway landlords that are
 * deleted afterwards.
 *
 * Part B (when `BASE_URL` is set, e.g. `BASE_URL=http://localhost:4321` with
 * `npm run dev` running): end to end over HTTP. Signs in as the seeded
 * landlord-01 and landlord-02 (`npm run db:seed`, password `SEED_PASSWORD`),
 * creates a room as landlord-01 through the real form, then checks every
 * page and action as landlord-02 answers 404 and leaves the room unchanged.
 *
 * Writes to the database: never point it at production.
 */
import { existsSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { createContactRequests } from '../src/lib/contact-requests-core';
import { createDb } from '../src/lib/db/create-db';
import { landlords, rooms, session, user } from '../src/lib/db/schema';
import { createLandlordRooms } from '../src/lib/landlord-rooms-core';
import { createLandlordSessions } from '../src/lib/landlord-sessions-core';
import { roomFormSchema } from '../src/lib/validation/room';
import { assertNotProduction } from './lib/env';

if (existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
assertNotProduction('test:ownership');

const db = createDb(url);
const repo = createLandlordRooms(db);
const contacts = createContactRequests(db);
const sessions = createLandlordSessions(db);

let failures = 0;
function check(name: string, ok: boolean, detail?: unknown): void {
  if (ok) console.log(`  ok    ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}`, detail ?? '');
  }
}

/** A valid room form, as the browser would post it. */
function roomForm(title: string): Record<string, string | string[]> {
  return {
    title,
    description: 'Phòng dùng cho kiểm thử quyền sở hữu.',
    price: '2.500.000',
    deposit: '2500000',
    area: '20',
    address: 'Đường Kiểm Thử',
    ward: 'Quy Nhơn Nam',
    neighborhood: 'Ghềnh Ráng',
    electricityMode: 'state',
    electricityPrice: '',
    waterPrice: '20.000',
    waterUnit: 'm3',
    wifi: '0',
    serviceFee: '',
    amenities: ['wifi', 'may-lanh'],
    status: 'available',
  };
}

function formData(fields: Record<string, string | string[]>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) body.append(key, item);
  }
  return body;
}

// ---------------------------------------------------------------- Part A
async function partA(): Promise<void> {
  console.log('A. Data layer (src/lib/landlord-rooms-core.ts)');
  const suffix = crypto.randomUUID().slice(0, 8);
  const ids = { a: `test-owner-a-${suffix}`, b: `test-owner-b-${suffix}` };
  const now = new Date();

  for (const [key, id] of Object.entries(ids)) {
    const email = `${id}@example.test`;
    await db.insert(user).values({ id, name: `Test ${key}`, email, emailVerified: false, createdAt: now, updatedAt: now });
    await db.insert(landlords).values({ id, name: `Test ${key}`, phone: '0905000000', email });
  }

  try {
    const parsed = roomFormSchema.safeParse(roomForm('Phòng của A'));
    check('form schema accepts a valid room', parsed.success, parsed.error?.issues);
    if (!parsed.success) return;

    const room = await repo.createRoom(ids.a, parsed.data);
    const before = (await db.select().from(rooms).where(eq(rooms.id, room.id)))[0];
    check('A creates a room owned by A', before?.landlordId === ids.a);
    check('a new room starts hidden (no photos yet)', before?.status === 'hidden');

    // Photo rows only (no storage needed for the data layer).
    const photo = (n: number) => {
      const id = crypto.randomUUID();
      return { id, key: `rooms/${room.id}/${id}.webp`, thumbKey: `rooms/${room.id}/${id}-thumb.webp`, width: 1600, height: 1200 + n };
    };
    const [p1, p2] = [photo(1), photo(2)];

    check('B cannot read it', (await repo.getOwnRoom(ids.b, room.id)) === undefined);
    check('B does not see it in their list', !(await repo.listOwnRooms(ids.b)).some((r) => r.id === room.id));
    check('B cannot update it', (await repo.updateOwnRoom(ids.b, room.id, { ...parsed.data, title: 'Bị B sửa' })) === 'not-found');
    check('B cannot change its status', (await repo.setOwnRoomStatus(ids.b, room.id, 'rented')) === 'not-found');
    check('B cannot count its photos', (await repo.countOwnRoomPhotos(ids.b, room.id)) === undefined);
    check('B cannot add photos to it', (await repo.addOwnRoomPhotos(ids.b, room.id, [p1])) === 'not-found');
    check('B cannot delete it', (await repo.deleteOwnRoom(ids.b, room.id)) === undefined);
    check('B dashboard counts 0 rooms', (await repo.getDashboardStats(ids.b)).totalRooms === 0);

    const after = (await db.select().from(rooms).where(eq(rooms.id, room.id)))[0];
    check(
      'the room is unchanged after B tried',
      after?.title === before?.title &&
        after?.status === before?.status &&
        after?.updatedAt.getTime() === before?.updatedAt.getTime(),
    );
    check('no photo rows were added by B', (await repo.countOwnRoomPhotos(ids.a, room.id)) === 0);

    // The photo rule.
    check('A cannot make it available without photos', (await repo.setOwnRoomStatus(ids.a, room.id, 'available')) === 'needs-photo');
    check(
      'A cannot save the form as available without photos',
      (await repo.updateOwnRoom(ids.a, room.id, { ...parsed.data, status: 'available' })) === 'needs-photo',
    );
    check('A adds two photos', (await repo.addOwnRoomPhotos(ids.a, room.id, [p1, p2])) === 'ok');
    check('B does not get the photo keys of A', (await repo.listOwnPhotoKeys(ids.b)).length === 0);
    check('A gets the keys of their photos', (await repo.listOwnPhotoKeys(ids.a)).length === 4);
    // The email rule: photos are not enough while A's email is unverified.
    check(
      'A cannot make it available before verifying the email',
      (await repo.setOwnRoomStatus(ids.a, room.id, 'available')) === 'needs-verification',
    );
    await db.update(user).set({ emailVerified: true }).where(eq(user.id, ids.a));
    check('A can now make it available', (await repo.setOwnRoomStatus(ids.a, room.id, 'available')) === 'ok');

    // Contact requests on A's room.
    const contactInput = { roomId: room.id, renterName: 'Người thuê thử', renterPhone: '0905123456', message: '' };
    const sent = await contacts.createContactRequest(contactInput);
    check('a renter can send a request for an available room', sent.status === 'created' && sent.notify.landlordEmail === `${ids.a}@example.test`);
    check('the same phone again within 24h is not stored', (await contacts.createContactRequest(contactInput)).status === 'duplicate');
    check('a request for a missing room is refused', (await contacts.createContactRequest({ ...contactInput, roomId: `${room.id}-x` })).status === 'not-found');
    if (sent.status === 'created') {
      const requestId = sent.request.id;
      check('B does not see it in their inbox', (await contacts.listOwnContactRequests(ids.b)).total === 0);
      check('B cannot change its status', (await contacts.setOwnContactRequestStatus(ids.b, requestId, 'closed')) === false);
      check('B dashboard counts 0 new requests', (await repo.getDashboardStats(ids.b)).newContactRequests === 0);
      const inboxA = await contacts.listOwnContactRequests(ids.a, { status: 'new' });
      check('A sees it as new in their inbox', inboxA.items.some((item) => item.id === requestId && item.roomTitle === before?.title));
      check('A dashboard counts 1 new request', (await repo.getDashboardStats(ids.a)).newContactRequests === 1);
      check('A marks it contacted', (await contacts.setOwnContactRequestStatus(ids.a, requestId, 'contacted')) === true);
      check('the status is saved', (await contacts.listOwnContactRequests(ids.a, { status: 'contacted' })).total === 1);
    }

    const tooMany = Array.from({ length: 9 }, (_, n) => photo(10 + n));
    check('the 10-photo limit holds', (await repo.addOwnRoomPhotos(ids.a, room.id, tooMany)) === 'limit');

    check('B cannot reorder its photos', (await repo.reorderOwnRoomPhotos(ids.b, room.id, [p2.id, p1.id])) === 'not-found');
    check('B cannot delete its photo', (await repo.deleteOwnRoomPhoto(ids.b, room.id, p1.id)) === undefined);
    check('A cannot reorder with a wrong id set', (await repo.reorderOwnRoomPhotos(ids.a, room.id, [p2.id])) === 'mismatch');
    check('A reorders (second photo becomes the cover)', (await repo.reorderOwnRoomPhotos(ids.a, room.id, [p2.id, p1.id])) === 'ok');
    check('the cover is now the second photo', (await repo.getOwnRoom(ids.a, room.id))?.photos[0]?.id === p2.id);

    const firstDelete = await repo.deleteOwnRoomPhoto(ids.a, room.id, p2.id);
    check('A deletes a photo and gets its keys', firstDelete?.keys.join() === [p2.key, p2.thumbKey].join() && !firstDelete.hidden);
    const lastDelete = await repo.deleteOwnRoomPhoto(ids.a, room.id, p1.id);
    check('deleting the last photo hides the available room', lastDelete?.hidden === true);
    check('the room is hidden now', (await repo.getOwnRoom(ids.a, room.id))?.status === 'hidden');
    check(
      'a hidden room takes no new requests',
      (await contacts.createContactRequest({ roomId: room.id, renterName: 'Khác', renterPhone: '0912345678', message: '' })).status === 'not-found',
    );

    // Positive control for the rest.
    check('A can read it', (await repo.getOwnRoom(ids.a, room.id))?.id === room.id);
    check('A can update it', (await repo.updateOwnRoom(ids.a, room.id, { ...parsed.data, title: 'A đã sửa', status: 'rented' })) === 'ok');
    const saved = await repo.getOwnRoom(ids.a, room.id);
    check('A sees the saved title and status', saved?.title === 'A đã sửa' && saved.status === 'rented');
    await repo.addOwnRoomPhotos(ids.a, room.id, [p1]);
    const keys = await repo.deleteOwnRoom(ids.a, room.id);
    check('A can delete it, getting the photo keys to remove', keys?.join() === [p1.key, p1.thumbKey].join());
    check('the room is gone', (await repo.getOwnRoom(ids.a, room.id)) === undefined);

    // Signed-in devices.
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const sessionRow = (userId: string, n: number) => ({
      id: `test-session-${userId}-${n}`,
      token: crypto.randomUUID(),
      userId,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });
    const [a1, a2, b1] = [sessionRow(ids.a, 1), sessionRow(ids.a, 2), sessionRow(ids.b, 1)];
    await db.insert(session).values([a1, a2, b1]);
    check('B does not see the devices of A', !(await sessions.listOwnSessions(ids.b, b1.id)).some((s) => s.id === a2.id));
    check('B cannot sign out a device of A', (await sessions.revokeOwnSession(ids.b, a2.id, b1.id)) === false);
    check('A cannot sign out the current device this way', (await sessions.revokeOwnSession(ids.a, a1.id, a1.id)) === false);
    check('A signs out another device', (await sessions.revokeOwnSession(ids.a, a2.id, a1.id)) === true);
    check("signing out A's other devices leaves B's session", (await sessions.revokeOtherSessions(ids.a, a1.id)) === 0);
    check('B still has their session', (await sessions.listOwnSessions(ids.b, b1.id)).length === 1);
  } finally {
    // landlords and rooms cascade from user.
    for (const id of Object.values(ids)) await db.delete(user).where(eq(user.id, id));
  }
}

// ---------------------------------------------------------------- Part B
interface Session {
  cookie: string;
}

async function signIn(base: string, email: string, password: string): Promise<Session> {
  const response = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Sign-in as ${email} failed: ${response.status} ${await response.text()}`);
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  return { cookie };
}

function request(base: string, session: Session | null, path: string, body?: URLSearchParams) {
  return fetch(`${base}${path}`, {
    method: body ? 'POST' : 'GET',
    redirect: 'manual',
    headers: {
      origin: base,
      ...(session ? { cookie: session.cookie } : {}),
      ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
    },
    body,
  });
}

function jsonRequest(base: string, session: Session | null, action: string, body: unknown) {
  return fetch(`${base}/_actions/${action}`, {
    method: 'POST',
    headers: { origin: base, 'content-type': 'application/json', ...(session ? { cookie: session.cookie } : {}) },
    body: JSON.stringify(body),
  });
}

async function partB(base: string): Promise<void> {
  console.log(`B. HTTP (${base})`);
  const password = process.env.SEED_PASSWORD;
  if (!password) throw new Error('SEED_PASSWORD is not set (needed to sign in as the seeded landlords).');

  const owner = await signIn(base, 'landlord-01@example.test', password);
  const other = await signIn(base, 'landlord-02@example.test', password);
  const [ownerRow] = await db.select().from(landlords).where(eq(landlords.email, 'landlord-01@example.test'));
  if (!ownerRow) throw new Error('Seeded landlord-01 not found. Run `npm run db:seed`.');

  // Create through the real page + form action, like a browser without JS.
  const title = `Kiểm thử quyền ${crypto.randomUUID().slice(0, 8)}`;
  const created = await request(base, owner, '/quan-ly/phong/moi?_action=createRoom', formData(roomForm(title)));
  check('owner: create redirects to the photo section', created.status === 303 && /\?moi=1#anh$/.test(created.headers.get('location') ?? ''), created.headers.get('location'));
  const [room] = await db.select().from(rooms).where(eq(rooms.title, title));
  check('owner: the room is saved for landlord-01', room?.landlordId === ownerRow.id);
  if (!room) return;

  try {
    const editPath = `/quan-ly/phong/${encodeURIComponent(room.id)}`;
    const update = formData({ ...roomForm('Bị landlord-02 sửa'), id: room.id });

    check('anonymous: edit page redirects to sign-in', (await request(base, null, editPath)).status === 303);
    const anonymousRpc = await request(base, null, '/_actions/deleteRoom', formData({ id: room.id }));
    check('anonymous: delete action is 401', anonymousRpc.status === 401, anonymousRpc.status);

    check('other: edit page is 404', (await request(base, other, editPath)).status === 404);
    const formUpdate = await request(base, other, `${editPath}?_action=updateRoom`, update);
    check('other: update via the edit form is 404', formUpdate.status === 404, formUpdate.status);
    const listStatus = await request(base, other, '/quan-ly/phong?_action=setRoomStatus', formData({ id: room.id, status: 'hidden' }));
    check('other: status change via the list form is 404', listStatus.status === 404, listStatus.status);
    const listDelete = await request(base, other, '/quan-ly/phong?_action=deleteRoom', formData({ id: room.id }));
    check('other: delete via the list form is 404', listDelete.status === 404, listDelete.status);
    for (const [action, body] of [
      ['updateRoom', update],
      ['setRoomStatus', formData({ id: room.id, status: 'hidden' })],
      ['deleteRoom', formData({ id: room.id })],
    ] as const) {
      const response = await request(base, other, `/_actions/${action}`, body);
      check(`other: ${action} action endpoint is 404`, response.status === 404, response.status);
    }
    const fakeId = crypto.randomUUID();
    const fakeKeys = { key: `rooms/${room.id}/${fakeId}.webp`, thumbKey: `rooms/${room.id}/${fakeId}-thumb.webp` };
    for (const [action, body] of [
      ['requestPhotoUploads', { roomId: room.id, count: 1 }],
      ['confirmPhotoUploads', { roomId: room.id, uploads: [fakeKeys] }],
      ['reorderPhotos', { roomId: room.id, photoIds: [] }],
      ['deletePhoto', { roomId: room.id, photoId: fakeId }],
    ] as const) {
      const response = await jsonRequest(base, other, action, body);
      check(`other: ${action} action endpoint is 404`, response.status === 404, response.status);
    }
    const anonymousPhotos = await jsonRequest(base, null, 'requestPhotoUploads', { roomId: room.id, count: 1 });
    check('anonymous: requestPhotoUploads is 401', anonymousPhotos.status === 401, anonymousPhotos.status);

    const otherList = await (await request(base, other, '/quan-ly/phong')).text();
    check("other: the room is not in landlord-02's list", !otherList.includes(room.id));

    const [after] = await db.select().from(rooms).where(eq(rooms.id, room.id));
    check(
      'the room is unchanged after landlord-02 tried',
      after?.title === room.title && after?.status === room.status && after.updatedAt.getTime() === room.updatedAt.getTime(),
    );

    // Positive control.
    check('owner: edit page is 200', (await request(base, owner, editPath)).status === 200);
    const ownerAvailableForm = await request(base, owner, `${editPath}?_action=updateRoom`, formData({ ...roomForm(title), id: room.id }));
    check('owner: saving the form as "available" without photos is refused (400)', ownerAvailableForm.status === 400, ownerAvailableForm.status);
    const ownerUpdate = await request(base, owner, `${editPath}?_action=updateRoom`, formData({ ...roomForm(`${title} đã sửa`), status: 'rented', id: room.id }));
    check('owner: update redirects', ownerUpdate.status === 303, ownerUpdate.status);
    const ownerAvailable = await request(base, owner, '/_actions/setRoomStatus', formData({ id: room.id, status: 'available' }));
    check('owner: "available" without photos is refused (400)', ownerAvailable.status === 400, ownerAvailable.status);
    const ownerStatus = await request(base, owner, '/quan-ly/phong?_action=setRoomStatus', formData({ id: room.id, status: 'hidden' }));
    check('owner: status change redirects', ownerStatus.status === 303, ownerStatus.status);
    const [edited] = await db.select().from(rooms).where(eq(rooms.id, room.id));
    check('owner: changes are saved', edited?.title === `${title} đã sửa` && edited.status === 'hidden');
    check('public: hidden room is 404', (await request(base, null, `/phong/${encodeURIComponent(room.id)}`)).status === 404);
    const ownerDelete = await request(base, owner, '/quan-ly/phong?_action=deleteRoom', formData({ id: room.id }));
    check('owner: delete redirects', ownerDelete.status === 303, ownerDelete.status);
    check('owner: the room is gone', (await db.select().from(rooms).where(eq(rooms.id, room.id))).length === 0);
  } finally {
    await db.delete(rooms).where(eq(rooms.id, room.id));
  }
}

await partA();
const base = process.env.BASE_URL?.replace(/\/$/, '');
if (base) await partB(base);
else console.log('B. HTTP: skipped (set BASE_URL and run the dev server to include it)');

console.log(failures === 0 ? '\nAll ownership checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
