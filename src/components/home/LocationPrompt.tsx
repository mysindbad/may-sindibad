"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/primitives";

const DONE_KEY = "sindbad_location_prompt_done";

function markDone() {
  try {
    window.localStorage.setItem(DONE_KEY, "1");
  } catch {
    // Private browsing or blocked storage - worst case it asks again next visit.
  }
}

/** A one-time, dismissible ask for location, shown as a popup instead of a
 * banner permanently sitting on the home page. Skips itself entirely once
 * the browser already has an answer (granted or denied) or the traveller has
 * seen it before, so it can only ever appear once per browser. */
export function LocationPrompt() {
  const { dict } = useLocale();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!("geolocation" in navigator)) return;
    try {
      if (window.localStorage.getItem(DONE_KEY)) return;
    } catch {
      // Fall through and ask once this session instead.
    }

    if (!("permissions" in navigator)) {
      setOpen(true);
      return;
    }
    navigator.permissions
      .query({ name: "geolocation" })
      .then((result) => {
        if (result.state === "prompt") setOpen(true);
        else markDone();
      })
      .catch(() => setOpen(true));
  }, []);

  function dismiss() {
    markDone();
    setOpen(false);
  }

  function enable() {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        markDone();
        setOpen(false);
        window.dispatchEvent(
          new CustomEvent("sindbad:location-granted", {
            detail: { lat: position.coords.latitude, lng: position.coords.longitude },
          }),
        );
      },
      () => {
        markDone();
        setOpen(false);
      },
      { timeout: 8000, maximumAge: 60_000, enableHighAccuracy: false },
    );
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-brand-950/50 p-4 backdrop-blur-sm sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 text-center shadow-[var(--shadow-elevated)] dark:bg-brand-900">
        <Image src="/brand/genie.png" alt="" width={72} height={72} className="mx-auto" />
        <h2 className="mt-2 text-base font-semibold text-brand-950 dark:text-sand-50">{dict.home.locationPromptTitle}</h2>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{dict.home.locationPromptBody}</p>
        <div className="mt-5 flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={dismiss}>
            {dict.home.locationPromptLater}
          </Button>
          <Button variant="primary" className="flex-1" onClick={enable}>
            {dict.home.enableLocation}
          </Button>
        </div>
      </div>
    </div>
  );
}
