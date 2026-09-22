import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { authAccounts, users } from "@/db/schema";
import { isLocale } from "@/i18n/config";
import { clearGuestId, getGuestId } from "@/lib/auth/guest";
import {
  GOOGLE_OAUTH_LOCALE_COOKIE,
  GOOGLE_OAUTH_RETURN_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  GOOGLE_TOKEN_ENDPOINT,
  GOOGLE_USERINFO_ENDPOINT,
  getGoogleClientConfig,
  type GoogleUserInfo,
} from "@/lib/auth/google";
import { migrateGuestDataToUser } from "@/lib/auth/migrate";
import { maybeBootstrapFirstAdmin } from "@/lib/auth/admin-bootstrap";
import { sanitizeReturnPath } from "@/lib/auth/return-path";
import { createSession } from "@/lib/auth/session";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { clientIpFromRequest } from "@/lib/request-client";
import { getTrustedAppOrigin } from "@/lib/app-origin";
import { parseJsonResponseWithLimit } from "@/lib/http/bounded-body";

const GOOGLE_HTTP_TIMEOUT_MS = 15_000;
const GOOGLE_RESPONSE_LIMIT_BYTES = 256 * 1024;

function clearOAuthCookies(response: NextResponse) {
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  response.cookies.delete(GOOGLE_OAUTH_VERIFIER_COOKIE);
  response.cookies.delete(GOOGLE_OAUTH_RETURN_COOKIE);
  response.cookies.delete(GOOGLE_OAUTH_LOCALE_COOKIE);
  return response;
}

function loginRedirect(request: NextRequest, locale: string, code: string, returnPath?: string) {
  const origin = getTrustedAppOrigin(request.nextUrl.origin);
  if (!origin) {
    // Never fall back to the request Host in production. If the canonical
    // public origin is missing/misconfigured, fail closed instead of creating
    // an attacker-influenced OAuth error redirect.
    return clearOAuthCookies(new NextResponse("Google sign-in is not configured for this deployment.", { status: 503 }));
  }
  const url = new URL(`/${locale}/login`, origin);
  url.searchParams.set("authError", code);
  if (returnPath && returnPath !== `/${locale}`) url.searchParams.set("next", returnPath);
  return clearOAuthCookies(NextResponse.redirect(url));
}

export async function GET(request: NextRequest) {
  const rate = await checkRateLimit(clientKeyFromRequest(request, "google-oauth-callback"), 40, 10 * 60 * 1000);
  if (!rate.allowed) return new NextResponse("Too many sign-in attempts. Please wait a few minutes.", { status: 429 });

  const cookieLocale = request.cookies.get(GOOGLE_OAUTH_LOCALE_COOKIE)?.value ?? "en";
  const locale = isLocale(cookieLocale) ? cookieLocale : "en";
  const returnPath = sanitizeReturnPath(request.cookies.get(GOOGLE_OAUTH_RETURN_COOKIE)?.value, `/${locale}`);

  if (request.nextUrl.searchParams.get("error")) {
    return loginRedirect(request, locale, "google_access_denied", returnPath);
  }

  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
  const verifier = request.cookies.get(GOOGLE_OAUTH_VERIFIER_COOKIE)?.value;
  const appOrigin = getTrustedAppOrigin(request.nextUrl.origin);
  const config = getGoogleClientConfig(request.nextUrl.origin);

  if (!appOrigin || !config || !code || !returnedState || !expectedState || returnedState !== expectedState || !verifier) {
    return loginRedirect(request, locale, "google_failed", returnPath);
  }

  try {
    const tokenResponse = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: verifier,
        grant_type: "authorization_code",
        redirect_uri: config.redirectUri,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(GOOGLE_HTTP_TIMEOUT_MS),
    });

    if (!tokenResponse.ok) return loginRedirect(request, locale, "google_failed", returnPath);
    const tokenData = await parseJsonResponseWithLimit<{ access_token?: string }>(tokenResponse, GOOGLE_RESPONSE_LIMIT_BYTES);
    if (!tokenData.access_token) return loginRedirect(request, locale, "google_failed", returnPath);

    const userInfoResponse = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(GOOGLE_HTTP_TIMEOUT_MS),
    });
    if (!userInfoResponse.ok) return loginRedirect(request, locale, "google_failed", returnPath);

    const profile = await parseJsonResponseWithLimit<Partial<GoogleUserInfo>>(userInfoResponse, GOOGLE_RESPONSE_LIMIT_BYTES);
    const email = profile.email?.trim().toLowerCase();
    if (!profile.sub || !email || profile.email_verified !== true) {
      return loginRedirect(request, locale, "google_unverified_email", returnPath);
    }

    const linked = await db
      .select({ user: users })
      .from(authAccounts)
      .innerJoin(users, eq(authAccounts.userId, users.id))
      .where(and(eq(authAccounts.provider, "google"), eq(authAccounts.providerAccountId, profile.sub)))
      .limit(1);

    let user = linked[0]?.user;

    if (!user) {
      const sameEmail = await db.select().from(users).where(eq(users.email, email)).limit(1);
      if (sameEmail[0]) {
        // Never silently attach an external identity to an existing password account.
        // That avoids account-linking takeover classes and lets us add explicit linking later.
        return loginRedirect(request, locale, "google_account_conflict", returnPath);
      }

      try {
        user = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(users)
            .values({
              email,
              name: profile.name?.trim().slice(0, 120) || email.split("@")[0] || "Traveler",
              passwordHash: null,
              avatarUrl: profile.picture ?? null,
              locale,
            })
            .returning();

          await tx.insert(authAccounts).values({
            userId: created.id,
            provider: "google",
            providerAccountId: profile.sub!,
          });
          return created;
        });
      } catch (createError) {
        // Two callback requests can race after Google redirects the same user
        // through multiple tabs. Let the database uniqueness constraints be
        // authoritative, then recover the already-created identity instead of
        // surfacing a random 500/"Google failed" response.
        const raced = await db
          .select({ user: users })
          .from(authAccounts)
          .innerJoin(users, eq(authAccounts.userId, users.id))
          .where(and(eq(authAccounts.provider, "google"), eq(authAccounts.providerAccountId, profile.sub!)))
          .limit(1);
        if (raced[0]?.user && raced[0].user.email === email) {
          user = raced[0].user;
        } else {
          throw createError;
        }
      }
    }

    // Preserve guest-owned work before establishing the Google-backed
    // authenticated session. A migration failure therefore cannot leave the
    // callback reporting failure while the browser is already logged in.
    const guestId = await getGuestId();
    if (guestId) await migrateGuestDataToUser(user.id, guestId);

    await createSession(user.id, {
      userAgent: request.headers.get("user-agent"),
      ip: clientIpFromRequest(request),
    });

    if (guestId) await clearGuestId();

    // Owner-configured, one-time-only: see lib/auth/admin-bootstrap.
    await maybeBootstrapFirstAdmin(user.id, user.email);

    return clearOAuthCookies(NextResponse.redirect(new URL(returnPath, appOrigin)));
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    return loginRedirect(request, locale, "google_failed", returnPath);
  }
}
