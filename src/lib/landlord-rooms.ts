/**
 * Landlord-side room data access for the dashboard (`/quan-ly/*`) and its actions.
 *
 * Authorization lives in these queries: each takes the signed-in landlord's id
 * and filters on `rooms.landlord_id` in SQL. Another landlord's room looks
 * exactly like a missing one, so callers answer 404.
 * Queries are in `landlord-rooms-core.ts`.
 */
import { db } from './db/client';
import { createLandlordRooms } from './landlord-rooms-core';

export type { DashboardStats, DeletedPhoto, NewRoomPhoto, SaveResult } from './landlord-rooms-core';

export const {
  listOwnRooms,
  getOwnRoom,
  createRoom,
  updateOwnRoom,
  setOwnRoomStatus,
  deleteOwnRoom,
  countOwnRoomPhotos,
  addOwnRoomPhotos,
  reorderOwnRoomPhotos,
  deleteOwnRoomPhoto,
  listOwnPhotoKeys,
  getDashboardStats,
} = createLandlordRooms(db);
