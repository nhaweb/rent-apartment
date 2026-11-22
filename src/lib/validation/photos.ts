import { z } from 'astro/zod';
import { MAX_PHOTOS_PER_ROOM } from '../photo-rules';
import { roomIdSchema } from './room';

const photoIdSchema = z.uuid();
/** Shape only; `confirmUploads` checks each key belongs to the room. */
const objectKeySchema = z.string().min(1).max(300);

/** Step 1: how many photos the browser is about to upload. */
export const requestPhotoUploadsSchema = z.object({
  roomId: roomIdSchema,
  count: z.number().int().min(1).max(MAX_PHOTOS_PER_ROOM),
});

/** Step 3: the key pairs the browser uploaded. */
export const confirmPhotoUploadsSchema = z.object({
  roomId: roomIdSchema,
  uploads: z
    .array(z.object({ key: objectKeySchema, thumbKey: objectKeySchema }))
    .min(1)
    .max(MAX_PHOTOS_PER_ROOM),
});

/** Every photo id of the room, in the new order (first = cover). */
export const reorderPhotosSchema = z.object({
  roomId: roomIdSchema,
  photoIds: z.array(photoIdSchema).max(MAX_PHOTOS_PER_ROOM),
});

export const deletePhotoSchema = z.object({
  roomId: roomIdSchema,
  photoId: photoIdSchema,
});
