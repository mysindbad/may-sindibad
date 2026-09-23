import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, locales, type Locale } from "@/i18n/config";

const LOCALE_COOKIE = "NEXT_LOCALE";
// Mirrors SESSION_COOKIE in lib/auth/session.ts, duplicated rather than
// imported so this Edge-run proxy never pulls in that module's Node-only
// db/pg dependencies.
const SESSION_COOKIE = "sindbad_session";
const CONTROL_ROOM_PATH_PATTERN = /^\/control-room(\/|$)/;
const CONTROL_ROOM_LOGIN_PATH = "/control-room/login";

function detectFromHeader(request: NextRequest): Locale | null {
  const header = request.headers.get("accept-language");
  if (!header) return null;
  for (const part of header.split(",")) {
    const tag = part.trim().split(";")[0]?.split("-")[0]?.toLowerCase();
    if (tag && isLocale(tag)) return tag;
  }
  return null;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // A genuinely separate section, outside the locale-prefixed traveller
  // tree entirely - never redirected into a locale, never wrapped by the
  // consumer shell, and with its own login instead of /[locale]/login.
  // Its own layout still re-checks the real session (and the admin role)
  // server-side; this is only the cheap, cookie-presence half of that
  // check, done here so a request with no session at all gets a real HTTP
  // redirect even from a non-JS client (a layout-level redirect() past a
  // streaming boundary can't always become a real HTTP redirect otherwise).
  if (CONTROL_ROOM_PATH_PATTERN.test(pathname)) {
    if (pathname !== CONTROL_ROOM_LOGIN_PATH && !request.cookies.get(SESSION_COOKIE)?.value) {
      const url = request.nextUrl.clone();
      url.pathname = CONTROL_ROOM_LOGIN_PATH;
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const hasLocalePrefix = locales.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
  if (hasLocalePrefix) {
    return NextResponse.next();
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = (cookieLocale && isLocale(cookieLocale) ? cookieLocale : null) ?? detectFromHeader(request) ?? defaultLocale;

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|icons|uploads|manifest.webmanifest|sw.js|robots.txt|.*\\..*).*)"],
};
