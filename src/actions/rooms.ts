/**
 * Landlord room mutations (zero-JS form actions from `/quan-ly/phong*`).
 *
 * Every handler resolves the signed-in landlord itself and passes their id to
 * `src/lib/landlord-rooms`, which scopes the SQL to rooms they own. Someone
 * else's room is NOT_FOUND. A room without photos, or of a landlord whose
 * email is not verified, cannot be "available".
 */
import { ActionError, defineAction } from 'astro:actions';
import type { SaveResult } from '../lib/landlord-rooms';
import { createRoom, setOwnRoomStatus, updateOwnRoom } from '../lib/landlord-rooms';
import { removeRoom } from '../lib/room-photo-uploads';
import { deleteRoomSchema, roomFormSchema, roomUpdateSchema, setRoomStatusSchema } from '../lib/validation';
import { NEEDS_PHOTO_MESSAGE, NEEDS_VERIFICATION_MESSAGE, notFound, requireLandlordId } from './guards';

function check(result: SaveResult): void {
  if (result === 'not-found') notFound();
  if (result === 'needs-photo') throw new ActionError({ code: 'BAD_REQUEST', message: NEEDS_PHOTO_MESSAGE });
  if (result === 'needs-verification') {
    throw new ActionError({ code: 'BAD_REQUEST', message: NEEDS_VERIFICATION_MESSAGE });
  }
}

export const roomActions = {
  /** New rooms start hidden (no photos yet); the page then opens the photo section. */
  createRoom: defineAction({
    accept: 'form',
    input: roomFormSchema,
    handler: async (input, context) => {
      const landlordId = await requireLandlordId(context);
      const room = await createRoom(landlordId, input);
      return { id: room.id };
    },
  }),

  updateRoom: defineAction({
    accept: 'form',
    input: roomUpdateSchema,
    handler: async ({ id, room }, context) => {
      const landlordId = await requireLandlordId(context);
      check(await updateOwnRoom(landlordId, id, room));
      return { id };
    },
  }),

  setRoomStatus: defineAction({
    accept: 'form',
    input: setRoomStatusSchema,
    handler: async ({ id, status }, context) => {
      const landlordId = await requireLandlordId(context);
      check(await setOwnRoomStatus(landlordId, id, status));
      return { id, status };
    },
  }),

  /** Deletes the room, its contact requests, photo rows and photo objects. */
  deleteRoom: defineAction({
    accept: 'form',
    input: deleteRoomSchema,
    handler: async ({ id }, context) => {
      const landlordId = await requireLandlordId(context);
      if (!(await removeRoom(landlordId, id))) notFound();
      return { id };
    },
  }),
};
