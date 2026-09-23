import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale, locales, type Locale } from "@/i18n/config";
import { buildLoginPath } from "@/lib/auth/return-path";

const LOCALE_COOKIE = "NEXT_LOCALE";
// Mirrors SESSION_COOKIE in lib/auth/session.ts, duplicated rather than
// imported so this Edge-run proxy never pulls in that module's Node-only
// db/pg dependencies.
const SESSION_COOKIE = "sindbad_session";
const BACKOFFICE_PATH_PATTERN = /^\/([a-z]{2})\/backoffice(\/|$)/;

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

  const hasLocalePrefix = locales.some((locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`));
  if (hasLocalePrefix) {
    // The dashboard's own layout still re-checks the real session (and the
    // admin role) server-side - this is only the cheap, cookie-presence-only
    // half of that check. It exists because a layout-level redirect() this
    // deep under the locale segment's streaming boundary can't always become
    // a real HTTP redirect (Next falls back to a client-side one instead,
    // harmless in a browser but a 200 to a non-JS client); catching the
    // common "no session at all" case here, before rendering starts, gives
    // bots/scanners/non-JS clients a real 307 for it.
    const backofficeMatch = BACKOFFICE_PATH_PATTERN.exec(pathname);
    if (backofficeMatch && !request.cookies.get(SESSION_COOKIE)?.value) {
      const loginPath = buildLoginPath(backofficeMatch[1], pathname);
      const [loginPathname, loginQuery] = loginPath.split("?");
      const url = request.nextUrl.clone();
      url.pathname = loginPathname;
      url.search = loginQuery ? `?${loginQuery}` : "";
      return NextResponse.redirect(url);
    }
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
