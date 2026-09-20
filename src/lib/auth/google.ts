import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getTrustedAppOrigin, hasTrustedProductionOrigin } from "@/lib/app-origin";

export const GOOGLE_OAUTH_STATE_COOKIE = "sindbad_google_oauth_state";
export const GOOGLE_OAUTH_VERIFIER_COOKIE = "sindbad_google_oauth_verifier";
export const GOOGLE_OAUTH_RETURN_COOKIE = "sindbad_google_oauth_return";
export const GOOGLE_OAUTH_LOCALE_COOKIE = "sindbad_google_oauth_locale";

export const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

export function googleAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && hasTrustedProductionOrigin());
}

export function getGoogleClientConfig(origin: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const baseUrl = getTrustedAppOrigin(origin);
  if (!baseUrl) return null;
  return {
    clientId,
    clientSecret,
    redirectUri: `${baseUrl}/api/auth/google/callback`,
  };
}

export function randomOAuthValue(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function createPkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
}
