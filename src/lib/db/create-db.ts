import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

/** Shared by the app client and scripts that run outside Astro (seed). */
export function createDb(url: string) {
  return drizzle({ client: neon(url), schema });
}

export type Db = ReturnType<typeof createDb>;
