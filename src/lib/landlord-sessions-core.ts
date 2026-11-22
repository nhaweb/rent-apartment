/**
 * Signed-in devices of a landlord (`/quan-ly/tai-khoan`), bound to a DB by
 * `createLandlordSessions(db)`; app code imports `landlord-sessions.ts`.
 * Keep this file free of `astro:*` imports (the ownership test uses it).
 *
 * Every query puts `session.user_id = userId` in the SQL, and only session
 * ids (never tokens) leave this module. Better Auth reads sessions from the
 * database on each request (no cookie cache), so a deleted row signs that
 * device out at once.
 */
import { and, desc, eq, gt, ne } from 'drizzle-orm';
import type { Db } from './db/create-db';
import { session } from './db/schema';

export interface LandlordSession {
  id: string;
  userAgent: string | null;
  createdAt: Date;
  /** Last refresh of the session (Better Auth updates it about once a day). */
  updatedAt: Date;
  current: boolean;
}

export function createLandlordSessions(db: Db) {
  /** Unexpired sessions, current first, then most recently active. */
  async function listOwnSessions(userId: string, currentSessionId: string): Promise<LandlordSession[]> {
    const rows = await db
      .select({ id: session.id, userAgent: session.userAgent, createdAt: session.createdAt, updatedAt: session.updatedAt })
      .from(session)
      .where(and(eq(session.userId, userId), gt(session.expiresAt, new Date())))
      .orderBy(desc(session.updatedAt));
    return rows
      .map((row) => ({ ...row, current: row.id === currentSessionId }))
      .sort((a, b) => Number(b.current) - Number(a.current));
  }

  /** Signs out one other device. `false` if it is missing, not theirs, or the current one. */
  async function revokeOwnSession(userId: string, sessionId: string, currentSessionId: string): Promise<boolean> {
    if (sessionId === currentSessionId) return false;
    const deleted = await db
      .delete(session)
      .where(and(eq(session.id, sessionId), eq(session.userId, userId)))
      .returning({ id: session.id });
    return deleted.length > 0;
  }

  /** Signs out every device except the current one; returns how many. */
  async function revokeOtherSessions(userId: string, currentSessionId: string): Promise<number> {
    const deleted = await db
      .delete(session)
      .where(and(eq(session.userId, userId), ne(session.id, currentSessionId)))
      .returning({ id: session.id });
    return deleted.length;
  }

  return { listOwnSessions, revokeOwnSession, revokeOtherSessions };
}
