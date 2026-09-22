"use client";

import { useEffect } from "react";

/** Registers the conservative app-shell service worker in production only. */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        // Browsers only re-check sw.js for byte changes periodically on their
        // own schedule; asking explicitly here means a shell-asset update
        // (e.g. the app icon) reaches an already-installed visitor on their
        // next visit instead of after up to a day.
        .then((registration) => registration.update())
        .catch((error) => {
          console.error("My Sindbad service worker registration failed", error);
        });
    };

    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
