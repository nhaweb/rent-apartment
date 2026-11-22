/** Shared setup for scripts that run outside Astro (seed, cleanup, tests). */
import { existsSync } from 'node:fs';
import { createR2, type R2 } from '../../src/lib/storage/r2-core';

if (existsSync('.env')) process.loadEnvFile('.env');

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. See .env.example.`);
  return value;
}

export function r2FromEnv(): R2 {
  return createR2({
    accountId: requireEnv('R2_ACCOUNT_ID'),
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    bucket: requireEnv('R2_BUCKET'),
  });
}

/**
 * Refuses to continue when DATABASE_URL points at the production Neon
 * branch or R2_BUCKET is the production bucket. Fails closed: both
 * production identifiers must be configured for the check to run.
 */
/**
 * Neon endpoint id from an id, a host or a connection string:
 * `ep-x-pooler.region.aws.neon.tech` and `postgresql://…@ep-x.region…/db` both give `ep-x`.
 */
export function neonEndpointId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const host = trimmed.includes('://') ? new URL(trimmed).hostname : trimmed.split('/')[0]!;
  return host.split('.')[0]!.replace(/-pooler$/, '');
}

export function assertNotProduction(what: string): void {
  const productionEndpoint = neonEndpointId(requireEnv('PRODUCTION_DB_ENDPOINT'));
  const productionBucket = requireEnv('PRODUCTION_R2_BUCKET').trim();
  const bucket = requireEnv('R2_BUCKET').trim();

  const endpoint = neonEndpointId(requireEnv('DATABASE_URL'));
  if (endpoint === productionEndpoint) {
    throw new Error(`${what}: DATABASE_URL points at the production database (${endpoint}). Refusing.`);
  }
  if (bucket === productionBucket) {
    throw new Error(`${what}: R2_BUCKET is the production bucket (${bucket}). Refusing.`);
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${what}: NODE_ENV is production. Refusing.`);
  }
}

/**
 * Refuses when DATABASE_URL and R2_BUCKET belong to different environments
 * (production database with a test bucket, or the reverse). Scripts that
 * delete objects by comparing the two (`r2:orphans --delete`) would
 * otherwise remove photos that are in use. Fails closed like
 * `assertNotProduction`.
 */
export function assertSameEnvironment(what: string): void {
  const productionDb = neonEndpointId(requireEnv('DATABASE_URL')) === neonEndpointId(requireEnv('PRODUCTION_DB_ENDPOINT'));
  const productionBucket = requireEnv('R2_BUCKET').trim() === requireEnv('PRODUCTION_R2_BUCKET').trim();
  if (productionDb !== productionBucket) {
    throw new Error(
      `${what}: DATABASE_URL is ${productionDb ? 'production' : 'not production'} but R2_BUCKET is ${productionBucket ? 'production' : 'not production'}. Refusing.`,
    );
  }
}
