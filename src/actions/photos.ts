/**
 * Room photo actions, called with JSON from the `<photo-manager>` element on
 * `/quan-ly/phong/[id]`. Image bytes never pass through here: the browser
 * uploads straight to R2 with the presigned URLs from `requestPhotoUploads`.
 * Every handler checks the session and room ownership (404 for other rooms).
 */
import { ActionError, defineAction } from 'astro:actions';
import { MAX_PHOTOS_PER_ROOM } from '../lib/photo-rules';
import { confirmUploads, prepareUploads, removePhoto } from '../lib/room-photo-uploads';
import { reorderOwnRoomPhotos } from '../lib/landlord-rooms';
import {
  confirmPhotoUploadsSchema,
  deletePhotoSchema,
  reorderPhotosSchema,
  requestPhotoUploadsSchema,
} from '../lib/validation';
import { notFound, requireLandlordId } from './guards';
import { takeHourlyQuota } from '../lib/rate-limit';

/** Presigned upload URLs per landlord per hour (several full rooms of photos). */
const UPLOAD_URLS_PER_HOUR = 60;

const limitMessage = (remaining: number) =>
  remaining > 0
    ? `Mỗi phòng tối đa ${MAX_PHOTOS_PER_ROOM} ảnh. Bạn chỉ thêm được ${remaining} ảnh nữa.`
    : `Mỗi phòng tối đa ${MAX_PHOTOS_PER_ROOM} ảnh. Hãy xóa bớt ảnh trước khi thêm.`;

export const photoActions = {
  requestPhotoUploads: defineAction({
    input: requestPhotoUploadsSchema,
    handler: async ({ roomId, count }, context) => {
      const landlordId = await requireLandlordId(context);
      // Presigned PUTs cannot cap the size, and unconfirmed objects stay in R2
      // until `r2:orphans`, so cap how many URLs one landlord can get per hour.
      if (!(await takeHourlyQuota('upload', landlordId, UPLOAD_URLS_PER_HOUR, count))) {
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Bạn đã tải lên quá nhiều ảnh trong một giờ. Hãy thử lại sau.',
        });
      }
      const result = await prepareUploads(landlordId, roomId, count);
      if (result.ok) return { uploads: result.uploads };
      if (result.reason === 'not-found') notFound();
      throw new ActionError({ code: 'BAD_REQUEST', message: limitMessage(result.remaining) });
    },
  }),

  confirmPhotoUploads: defineAction({
    input: confirmPhotoUploadsSchema,
    handler: async ({ roomId, uploads }, context) => {
      const landlordId = await requireLandlordId(context);
      const result = await confirmUploads(landlordId, roomId, uploads);
      if (result.ok) return { photos: result.photos, problems: result.problems };
      if (result.reason === 'not-found') notFound();
      throw new ActionError({ code: 'BAD_REQUEST', message: limitMessage(0) });
    },
  }),

  reorderPhotos: defineAction({
    input: reorderPhotosSchema,
    handler: async ({ roomId, photoIds }, context) => {
      const landlordId = await requireLandlordId(context);
      const result = await reorderOwnRoomPhotos(landlordId, roomId, photoIds);
      if (result === 'not-found') notFound();
      if (result === 'mismatch') {
        throw new ActionError({ code: 'CONFLICT', message: 'Danh sách ảnh đã thay đổi. Hãy tải lại trang.' });
      }
      return { photoIds };
    },
  }),

  deletePhoto: defineAction({
    input: deletePhotoSchema,
    handler: async ({ roomId, photoId }, context) => {
      const landlordId = await requireLandlordId(context);
      const result = await removePhoto(landlordId, roomId, photoId);
      if (!result) notFound();
      return result;
    },
  }),
};
