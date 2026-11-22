/**
 * `/quan-ly/tai-khoan` and the dashboard verification banner:
 * - profile (name, phone, Zalo): our own query (`src/lib/landlord-profile.ts`);
 * - password: Better Auth `/change-password` (rate limited, checks the current
 *   password, signs out other devices);
 * - email verification resend: Better Auth `/send-verification-email`;
 * - signed-in devices: our own queries on `session`, scoped by user id;
 * - account deletion: Better Auth `/delete-user` with the password (rows
 *   cascade from `user`), then the photo objects are removed from R2.
 */
import { ActionError, defineAction, type ActionAPIContext } from 'astro:actions';
import {
  callAuthEndpoint,
  EMAIL_VERIFIED_CALLBACK,
  getAuthState,
  resetAuthState,
  type AuthState,
} from '../lib/auth';
import { updateLandlordProfile } from '../lib/landlord-profile';
import { listOwnPhotoKeys } from '../lib/landlord-rooms';
import { revokeOtherSessions, revokeOwnSession } from '../lib/landlord-sessions';
import { removeObjects } from '../lib/room-photo-uploads';
import {
  changePasswordSchema,
  deleteAccountSchema,
  revokeSessionSchema,
  updateProfileSchema,
} from '../lib/validation';
import { requireLandlordId } from './guards';

async function requireAuthState(context: ActionAPIContext): Promise<AuthState> {
  const state = await getAuthState(context);
  if (!state) throw new ActionError({ code: 'UNAUTHORIZED', message: 'Vui lòng đăng nhập lại.' });
  return state;
}

function authErrorCode(status: number) {
  return status === 429 ? 'TOO_MANY_REQUESTS' : status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST';
}

const isWrongPassword = (code: string | undefined) =>
  code === 'INVALID_PASSWORD' || code === 'INVALID_EMAIL_OR_PASSWORD';

export const accountActions = {
  updateProfile: defineAction({
    accept: 'form',
    input: updateProfileSchema,
    handler: async (input, context) => {
      const landlordId = await requireLandlordId(context);
      if (!(await updateLandlordProfile(landlordId, input))) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Không tìm thấy tài khoản.' });
      }
      resetAuthState(context);
      return { saved: true };
    },
  }),

  changePassword: defineAction({
    accept: 'form',
    input: changePasswordSchema,
    handler: async ({ currentPassword, password }, context) => {
      await requireLandlordId(context);
      const result = await callAuthEndpoint(context, '/change-password', {
        currentPassword,
        newPassword: password,
        revokeOtherSessions: true,
      });
      if (!result.ok) {
        throw new ActionError({
          code: authErrorCode(result.status),
          message: isWrongPassword(result.code) ? 'Mật khẩu hiện tại không đúng' : result.error,
        });
      }
      resetAuthState(context);
      return { changed: true };
    },
  }),

  resendVerificationEmail: defineAction({
    accept: 'form',
    handler: async (_input, context) => {
      const state = await requireAuthState(context);
      if (state.emailVerified) return { sent: false };
      const result = await callAuthEndpoint(context, '/send-verification-email', {
        email: state.landlord.email,
        callbackURL: EMAIL_VERIFIED_CALLBACK,
      });
      if (!result.ok) throw new ActionError({ code: authErrorCode(result.status), message: result.error });
      return { sent: true };
    },
  }),

  revokeSession: defineAction({
    accept: 'form',
    input: revokeSessionSchema,
    handler: async ({ sessionId }, context) => {
      const state = await requireAuthState(context);
      if (!(await revokeOwnSession(state.userId, sessionId, state.sessionId))) {
        throw new ActionError({ code: 'NOT_FOUND', message: 'Thiết bị này đã đăng xuất.' });
      }
      return { revoked: 1 };
    },
  }),

  revokeOtherSessions: defineAction({
    accept: 'form',
    handler: async (_input, context) => {
      const state = await requireAuthState(context);
      return { revoked: await revokeOtherSessions(state.userId, state.sessionId) };
    },
  }),

  deleteAccount: defineAction({
    accept: 'form',
    input: deleteAccountSchema,
    handler: async ({ password }, context) => {
      const landlordId = await requireLandlordId(context);
      // Read the object keys first: the rows are gone once the user is deleted.
      const keys = await listOwnPhotoKeys(landlordId);
      const result = await callAuthEndpoint(context, '/delete-user', { password });
      if (!result.ok) {
        throw new ActionError({
          code: authErrorCode(result.status),
          message: isWrongPassword(result.code) ? 'Mật khẩu không đúng' : result.error,
        });
      }
      await removeObjects(keys);
      resetAuthState(context);
      return { deleted: true };
    },
  }),
};
