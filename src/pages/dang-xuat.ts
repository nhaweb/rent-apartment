/** Logout: POST from the dashboard header, then back to the sign-in page. */
import type { APIRoute } from 'astro';
import { signOut, SIGN_IN_PATH } from '../lib/auth';

export const prerender = false;

export const POST: APIRoute = async (context) => {
  await signOut(context);
  return context.redirect(SIGN_IN_PATH, 303);
};
