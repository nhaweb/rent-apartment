/**
 * Contact requests. `createContactRequest` is public (renters have no
 * account): zero-JS form on `/phong/[id]`, guarded by a honeypot, an hourly
 * limit per IP (DB) and a duplicate check (same phone + room within 24h,
 * answered as a success). `setContactRequestStatus` is the landlord inbox.
 */
import { ActionError, defineAction } from 'astro:actions';
import { CONTACT_RATE_LIMIT_PER_HOUR } from 'astro:env/server';
import { clientIp } from '../lib/auth/request';
import { createContactRequest, notifyLandlord, setOwnContactRequestStatus } from '../lib/contact-requests';
import { takeHourlyQuota } from '../lib/rate-limit';
import { CONTACT_HONEYPOT_FIELD, contactFormSchema, setContactRequestStatusSchema } from '../lib/validation';
import { requireLandlordId } from './guards';

export const contactActions = {
  createContactRequest: defineAction({
    accept: 'form',
    input: contactFormSchema,
    handler: async ({ [CONTACT_HONEYPOT_FIELD]: honeypot, ...input }, context) => {
      // Bots get the same answer as people, so they do not adapt.
      if (honeypot) return { sent: true };

      if (!(await takeHourlyQuota('contact', clientIp(context), CONTACT_RATE_LIMIT_PER_HOUR))) {
        throw new ActionError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Bạn đã gửi nhiều yêu cầu trong một giờ. Vui lòng thử lại sau.',
        });
      }

      const result = await createContactRequest(input);
      if (result.status === 'not-found') {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Phòng này không còn nhận yêu cầu xem phòng.' });
      }
      if (result.status === 'created') await notifyLandlord(result.request, result.notify);
      return { sent: true };
    },
  }),

  setContactRequestStatus: defineAction({
    accept: 'form',
    input: setContactRequestStatusSchema,
    handler: async ({ id, status }, context) => {
      const landlordId = await requireLandlordId(context);
      if (!(await setOwnContactRequestStatus(landlordId, id, status))) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Không tìm thấy yêu cầu này.' });
      }
      return { id, status };
    },
  }),
};
