/** Better Auth HTTP endpoints (`/api/auth/*`). */
import type { APIRoute } from 'astro';
import { authRequestHeaders } from '../../../lib/auth/request';
import { auth } from '../../../lib/auth/server';

export const prerender = false;

export const ALL: APIRoute = async (context) => {
  // Replace whatever X-Forwarded-For the client sent with the trusted IP.
  const request = new Request(context.request, { headers: authRequestHeaders(context) });
  return auth.handler(request);
};
