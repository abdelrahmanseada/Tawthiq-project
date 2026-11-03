import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { sanitizeUserAgent, getClientIpDetails } from "@/lib/http";
import { hashIp } from "@/lib/security/crypto";

export const SESSION_COOKIE = "evs_sid";

/** Creates a server-side session row and sets its httpOnly cookie. */
export async function createUserSession(
  adminId: string,
  headers: Headers,
  maxAgeSeconds: number = env.SESSION_MAX_AGE,
): Promise<string> {
  const details = getClientIpDetails(headers);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + maxAgeSeconds * 1000);
  const session = await prisma.userSession.create({
    data: {
      admin_id: adminId,
      jti: `${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`,
      user_agent: sanitizeUserAgent(headers.get("user-agent")),
      ip_hash: hashIp(details.ip),
      expires_at: expiresAt,
      last_seen_at: now,
    },
  });
  const store = await cookies();
  store.set({
    name: SESSION_COOKIE,
    value: session.id,
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_URL.startsWith("https://"),
    path: "/",
    maxAge: maxAgeSeconds,
  });
  return session.id;
}

export async function readSessionCookie(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

export interface ValidatedSession {
  id: string;
  adminId: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
}

/**
 * Validates a session against expiry and the company's idle timeout. Revokes the
 * row when stale so a stolen cookie does not stay valid indefinitely.
 */
export async function validateUserSession(
  adminId: string,
  sessionId: string,
  idleTimeoutMinutes: number,
): Promise<ValidatedSession | null> {
  const session = await prisma.userSession.findFirst({
    where: { id: sessionId, admin_id: adminId, revoked_at: null },
  });
  if (!session) return null;
  const now = new Date();
  const idleMs = Math.max(5, idleTimeoutMinutes) * 60 * 1000;
  if (
    session.expires_at.getTime() <= now.getTime() ||
    now.getTime() - session.last_seen_at.getTime() > idleMs
  ) {
    await prisma.userSession.update({ where: { id: session.id }, data: { revoked_at: now } });
    return null;
  }
  if (now.getTime() - session.last_seen_at.getTime() > 60_000) {
    await prisma.userSession.update({ where: { id: session.id }, data: { last_seen_at: now } });
  }
  return {
    id: session.id,
    adminId: session.admin_id,
    createdAt: session.created_at,
    lastSeenAt: session.last_seen_at,
    expiresAt: session.expires_at,
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.userSession.updateMany({
    where: { id: sessionId, revoked_at: null },
    data: { revoked_at: new Date() },
  });
}

export async function revokeOtherSessions(adminId: string, currentSessionId: string): Promise<number> {
  const result = await prisma.userSession.updateMany({
    where: { admin_id: adminId, revoked_at: null, NOT: { id: currentSessionId } },
    data: { revoked_at: new Date() },
  });
  return result.count;
}

export async function listUserSessions(adminId: string, now = new Date()) {
  const activeSince = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return prisma.userSession.findMany({
    where: {
      admin_id: adminId,
      revoked_at: null,
      expires_at: { gt: now },
      last_seen_at: { gte: activeSince },
    },
    orderBy: { last_seen_at: "desc" },
    take: 50,
  });
}

/** Revoke exactly one session belonging to this admin, never the current one. */
export async function revokeUserSession(adminId: string, sessionId: string, currentSessionId: string): Promise<boolean> {
  if (sessionId === currentSessionId) return false;
  const result = await prisma.userSession.updateMany({
    where: { id: sessionId, admin_id: adminId, revoked_at: null, NOT: { id: currentSessionId } },
    data: { revoked_at: new Date() },
  });
  return result.count > 0;
}
