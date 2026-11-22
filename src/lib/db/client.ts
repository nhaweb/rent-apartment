/**
 * Database client for app code. Neon's HTTP driver is stateless (one fetch per
 * query), so it works on Vercel serverless and the Fly.io Node server alike.
 *
 * Only `src/lib/` may import this.
 */
import { DATABASE_URL } from 'astro:env/server';
import { createDb } from './create-db';

export const db = createDb(DATABASE_URL);
