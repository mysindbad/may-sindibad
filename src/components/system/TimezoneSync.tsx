"use client";

import { useEffect } from "react";

const COOKIE_NAME = "sindbad_tz";

export function TimezoneSync() {
  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!timeZone) return;
    const encoded = encodeURIComponent(timeZone);
    const current = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE_NAME}=`))
      ?.slice(COOKIE_NAME.length + 1);
    if (current === encoded) return;
    document.cookie = `${COOKIE_NAME}=${encoded}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, []);

  return null;
}
