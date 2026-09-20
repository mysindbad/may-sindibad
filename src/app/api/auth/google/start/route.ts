import { NextRequest, NextResponse } from "next/server";
import { isLocale } from "@/i18n/config";
import {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GOOGLE_OAUTH_LOCALE_COOKIE,
  GOOGLE_OAUTH_RETURN_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_OAUTH_VERIFIER_COOKIE,
  createPkceChallenge,
  getGoogleClientConfig,
  randomOAuthValue,
} from "@/lib/auth/google";
import { sanitizeReturnPath } from "@/lib/auth/return-path";
import { checkRateLimit, clientKeyFromRequest } from "@/lib/rate-limit";
import { getTrustedAppOrigin } from "@/lib/app-origin";

const OAUTH_COOKIE_MAX_AGE = 10 * 60;

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: OAUTH_COOKIE_MAX_AGE,
  };
}

export async function GET(request: NextRequest) {
  const rate = await checkRateLimit(clientKeyFromRequest(request, "google-oauth-start"), 30, 10 * 60 * 1000);
  if (!rate.allowed) return new NextResponse("Too many sign-in attempts. Please wait a few minutes.", { status: 429 });

  const rawLocale = request.nextUrl.searchParams.get("locale") ?? "en";
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const returnPath = sanitizeReturnPath(request.nextUrl.searchParams.get("next"), `/${locale}`);
  const appOrigin = getTrustedAppOrigin(request.nextUrl.origin);
  const config = getGoogleClientConfig(request.nextUrl.origin);
  if (!config || !appOrigin) {
    // Development resolves the local request origin through getTrustedAppOrigin.
    // Production must never fall back to the request Host when canonical origin
    // configuration is missing or invalid.
    return new NextResponse("Google sign-in is not configured for this deployment.", { status: 503 });
  }

  const state = randomOAuthValue(32);
  const verifier = randomOAuthValue(48);
  const challenge = createPkceChallenge(verifier);

  const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  authorizationUrl.searchParams.set("client_id", config.clientId);
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid email profile");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("include_granted_scopes", "true");

  const response = NextResponse.redirect(authorizationUrl);
  const options = authCookieOptions();
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, options);
  response.cookies.set(GOOGLE_OAUTH_VERIFIER_COOKIE, verifier, options);
  response.cookies.set(GOOGLE_OAUTH_RETURN_COOKIE, returnPath, options);
  response.cookies.set(GOOGLE_OAUTH_LOCALE_COOKIE, locale, options);
  return response;
}
