/**
 * Form actions. Forms post here with plain HTML (no client JS). Auth: the
 * Better Auth calls and error mapping live in `src/lib/auth`. Rooms: see
 * `./rooms.ts`; contact requests: `./contact.ts`; account: `./account.ts`; photos (JSON, from the uploader): `./photos.ts`.
 */
import { ActionError, defineAction } from 'astro:actions';
import {
  callAuthEndpoint,
  EMAIL_VERIFIED_CALLBACK,
  GENERIC_AUTH_ERROR,
  landlordExists,
  resetAuthState,
  safeNextPath,
  type AuthCallResult,
} from '../lib/auth';
import {
  requestPasswordResetSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from '../lib/validation';
import { accountActions } from './account';
import { contactActions } from './contact';
import { photoActions } from './photos';
import { roomActions } from './rooms';

/** Throws the Vietnamese message from a failed auth call. */
function fail(result: Extract<AuthCallResult<unknown>, { ok: false }>): never {
  const code =
    result.status === 429 ? 'TOO_MANY_REQUESTS' : result.status >= 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST';
  throw new ActionError({ code, message: result.error });
}

export const server = {
  ...roomActions,
  ...photoActions,
  ...contactActions,
  ...accountActions,

  signUp: defineAction({
    accept: 'form',
    input: signUpSchema,
    handler: async (input, context) => {
      const result = await callAuthEndpoint<{ user: { id: string } }>(context, '/sign-up/email', {
        name: input.name,
        email: input.email,
        password: input.password,
        phone: input.phone,
        zalo: input.zalo,
        // Where the link in the verification email lands.
        callbackURL: EMAIL_VERIFIED_CALLBACK,
      });
      if (!result.ok) fail(result);
      // The landlord row is created in a Better Auth hook that only logs
      // failures; make sure it exists before calling this a success.
      if (!(await landlordExists(result.data.user.id))) {
        throw new ActionError({ code: 'INTERNAL_SERVER_ERROR', message: GENERIC_AUTH_ERROR });
      }
      resetAuthState(context);
      return { redirectTo: safeNextPath(input.next) };
    },
  }),

  signIn: defineAction({
    accept: 'form',
    input: signInSchema,
    handler: async (input, context) => {
      const result = await callAuthEndpoint(context, '/sign-in/email', {
        email: input.email,
        password: input.password,
        rememberMe: true,
      });
      if (!result.ok) fail(result);
      resetAuthState(context);
      return { redirectTo: safeNextPath(input.next) };
    },
  }),

  requestPasswordReset: defineAction({
    accept: 'form',
    input: requestPasswordResetSchema,
    handler: async (input, context) => {
      // Better Auth answers the same whether or not the email exists.
      const result = await callAuthEndpoint(context, '/request-password-reset', {
        email: input.email,
        redirectTo: '/dat-lai-mat-khau',
      });
      if (!result.ok) fail(result);
      return { sent: true };
    },
  }),

  resetPassword: defineAction({
    accept: 'form',
    input: resetPasswordSchema,
    handler: async (input, context) => {
      const result = await callAuthEndpoint(context, '/reset-password', {
        newPassword: input.password,
        token: input.token,
      });
      if (!result.ok) fail(result);
      return { redirectTo: '/dang-nhap?da-doi-mat-khau=1' };
    },
  }),
};
