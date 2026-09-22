import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { signupSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { getGuestId, clearGuestId } from "@/lib/auth/guest";
import { migrateGuestDataToUser } from "@/lib/auth/migrate";
import { maybeBootstrapFirstAdmin } from "@/lib/auth/admin-bootstrap";
import { jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { clientIpFromRequest } from "@/lib/request-client";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  const rate = await checkRateLimit(clientKeyFromRequest(request, "signup"), 10, 10 * 60 * 1000);
  if (!rate.allowed) return jsonError("Too many attempts. Please wait a few minutes.", 429);

  const json = await parseJsonBodyWithLimit(request);
  if (!json.ok) return jsonError("Request body is too large.", 413);
  const body = json.body;
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const { email, password, name } = parsed.data;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) return jsonError("An account with this email already exists.", 409, { code: "email_in_use" });

  let user;
  try {
    [user] = await db
      .insert(users)
      .values({ email, name, passwordHash: hashPassword(password) })
      .returning();
  } catch (error) {
    // The email uniqueness constraint is the final authority when two signup
    // requests race. Re-check instead of leaking a database error as a 500.
    const [raced] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (raced) return jsonError("An account with this email already exists.", 409, { code: "email_in_use" });
    throw error;
  }

  // Preserve guest-created work before establishing the new login session.
  // A migration failure leaves the newly-created account recoverable by normal
  // login and keeps the guest cookie for a later safe retry.
  const guestId = await getGuestId();
  if (guestId) await migrateGuestDataToUser(user.id, guestId);

  await createSession(user.id, {
    userAgent: request.headers.get("user-agent"),
    ip: clientIpFromRequest(request),
  });

  if (guestId) await clearGuestId();

  // Owner-configured, one-time-only: see lib/auth/admin-bootstrap.
  const promoted = await maybeBootstrapFirstAdmin(user.id, user.email);
  const role = promoted ? "admin" : user.role;

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role, locale: user.locale, avatarUrl: user.avatarUrl, homeCity: user.homeCity },
  });
}
