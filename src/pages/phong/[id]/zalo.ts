/**
 * "Nhắn Zalo" on `/phong/[id]`: redirects to the landlord's Zalo chat when they
 * opted in. Rules in `src/lib/direct-contact-route.ts`.
 */
import { directContactRoute } from '../../../lib/direct-contact-route';

export const prerender = false;

export const GET = directContactRoute('zalo');
