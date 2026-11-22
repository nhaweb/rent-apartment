/**
 * "Gọi điện" on `/phong/[id]`: redirects to `tel:` with the landlord's phone
 * number (every available room). Rules in `src/lib/direct-contact-route.ts`.
 */
import { directContactRoute } from '../../../lib/direct-contact-route';

export const prerender = false;

export const GET = directContactRoute('phone');
