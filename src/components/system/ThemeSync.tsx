"use client";

import { useEffect } from "react";

// Dark from 7pm to 6am local time - simple and predictable rather than a
// sunrise/sunset calculation that would need the traveller's coordinates.
function isNightNow(): boolean {
  const hour = new Date().getHours();
  return hour < 6 || hour >= 19;
}

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function ThemeSync() {
  useEffect(() => {
    function apply() {
      document.documentElement.classList.toggle("dark", isNightNow());
    }
    apply();
    const id = window.setInterval(apply, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", apply);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", apply);
    };
  }, []);

  return null;
}
