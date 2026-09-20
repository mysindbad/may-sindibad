import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { loginSchema } from "@/lib/validation";
import { consumePasswordVerificationWork, hashPassword, passwordHashNeedsUpgrade, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { getGuestId, clearGuestId } from "@/lib/auth/guest";
import { migrateGuestDataToUser } from "@/lib/auth/migrate";
import { jsonError, zodErrorResponse } from "@/lib/api-utils";
import { isTrustedMutationRequest } from "@/lib/security/mutation-origin";
import { parseJsonBodyWithLimit } from "@/lib/http/bounded-body";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { clientIpFromRequest } from "@/lib/request-client";

export async function POST(request: Request) {
  if (!isTrustedMutationRequest(request)) return jsonError("Request origin is not allowed.", 403);
  const rate = await checkRateLimit(clientKeyFromRequest(request, "login"), 15, 10 * 60 * 1000);
  if (!rate.allowed) return jsonError("Too many attempts. Please wait a few minutes.", 429);

  const json = await parseJsonBodyWithLimit(request);
  if (!json.ok) return jsonError("Request body is too large.", 413);
  const body = json.body;
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return zodErrorResponse(parsed.error);

  const { email, password } = parsed.data;
  const rows = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const user = rows[0];

  let passwordMatches = false;
  let needsUpgrade = true;
  if (user?.passwordHash) {
    needsUpgrade = passwordHashNeedsUpgrade(user.passwordHash);
    passwordMatches = verifyPassword(password, user.passwordHash);
    // Legacy or malformed hashes are cheaper to reject than the current work
    // factor, so add a current-cost derivation to reduce timing-based account
    // enumeration. Current hashes already paid that cost in verifyPassword.
    if (needsUpgrade) consumePasswordVerificationWork(password);
  } else {
    // Keep missing and Google-only accounts on approximately the same CPU
    // path as a normal wrong-password attempt without disclosing which case it was.
    consumePasswordVerificationWork(password);
  }

  if (!user || !user.passwordHash || !passwordMatches) {
    return jsonError("Incorrect email or password.", 401, { code: "invalid_credentials" });
  }

  // Upgrade older scrypt records only after the old password has been proven.
  // The compare-and-set condition prevents two parallel logins from
  // overwriting each other's newer hash.
  if (needsUpgrade) {
    const previousHash = user.passwordHash;
    await db
      .update(users)
      .set({ passwordHash: hashPassword(password), updatedAt: new Date() })
      .where(and(eq(users.id, user.id), eq(users.passwordHash, previousHash)));
  }

  // Claim guest-owned data before establishing the authenticated session.
  // If migration fails, the request fails without leaving the browser logged in
  // to an account that cannot yet see its guest-created trips/conversations.
  const guestId = await getGuestId();
  if (guestId) await migrateGuestDataToUser(user.id, guestId);

  await createSession(user.id, {
    userAgent: request.headers.get("user-agent"),
    ip: clientIpFromRequest(request),
  });

  if (guestId) await clearGuestId();

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, locale: user.locale, avatarUrl: user.avatarUrl, homeCity: user.homeCity },
  });
}
