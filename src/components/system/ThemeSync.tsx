"use client";

import { useEffect } from "react";

export const THEME_STORAGE_KEY = "sindbad_theme";
export type ThemePreference = "auto" | "light" | "dark";

// Dark from 7pm to 6am local time when the traveller hasn't picked a mode
// themselves - simple and predictable rather than a sunrise/sunset
// calculation that would need their coordinates.
function isNightNow(): boolean {
  const hour = new Date().getHours();
  return hour < 6 || hour >= 19;
}

export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "auto") return stored;
  } catch {
    // Private browsing or blocked storage: fall back to automatic.
  }
  return "auto";
}

export function applyThemePreference(preference: ThemePreference) {
  const isDark = preference === "dark" || (preference === "auto" && isNightNow());
  document.documentElement.classList.toggle("dark", isDark);
}

export function setThemePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Nothing to persist to - the in-memory class toggle below still applies
    // for the rest of this visit.
  }
  applyThemePreference(preference);
}

const CHECK_INTERVAL_MS = 5 * 60 * 1000;

export function ThemeSync() {
  useEffect(() => {
    function apply() {
      applyThemePreference(readThemePreference());
    }
    apply();
    const id = window.setInterval(apply, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", apply);
    window.addEventListener("storage", apply);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", apply);
      window.removeEventListener("storage", apply);
    };
  }, []);

  return null;
}
