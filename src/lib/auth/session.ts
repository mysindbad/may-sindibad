import "server-only";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";

export const SESSION_COOKIE = "sindbad_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: "traveler" | "provider" | "admin";
  locale: string;
  homeCity: string | null;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string, meta: { userAgent?: string | null; ip?: string | null }) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
    userAgent: meta.userAgent ?? null,
    ipAddress: meta.ip ?? null,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  store.delete(SESSION_COOKIE);
}

async function getCurrentSessionContext(): Promise<{ user: PublicUser; createdAt: Date } | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const rows = await db
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    return null;
  }

  return {
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      avatarUrl: row.user.avatarUrl,
      role: row.user.role,
      locale: row.user.locale,
      homeCity: row.user.homeCity,
    },
    createdAt: row.session.createdAt,
  };
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  return (await getCurrentSessionContext())?.user ?? null;
}

export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error("UNAUTHENTICATED");
    err.name = "UnauthenticatedError";
    throw err;
  }
  return user;
}

/** Require a recently-established session before irreversible account actions. */
export async function requireFreshUser(maxAgeMs = 15 * 60 * 1000): Promise<PublicUser> {
  if (!Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) throw new Error("Fresh-session max age must be a positive safe integer.");
  const context = await getCurrentSessionContext();
  if (!context) {
    const err = new Error("UNAUTHENTICATED");
    err.name = "UnauthenticatedError";
    throw err;
  }
  if (Date.now() - context.createdAt.getTime() > maxAgeMs) {
    const err = new Error("REAUTHENTICATION_REQUIRED");
    err.name = "ReauthenticationRequiredError";
    throw err;
  }
  return context.user;
}
