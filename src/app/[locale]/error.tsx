"use client";

import { useEffect } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button } from "@/components/ui/primitives";

// Without this boundary any thrown error inside a route replaced the whole
// screen with Next's default error page -- no branding, no translation and no
// way back into the app.
export default function LocaleError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { dict } = useLocale();

  useEffect(() => {
    // The digest is the only safe correlator: the message itself may carry
    // details we do not want to render to the visitor.
    console.error("Route error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <span className="text-4xl">🧭</span>
      <h1 className="text-lg font-semibold text-brand-950 dark:text-sand-50">{dict.common.somethingWentWrong}</h1>
      <Button onClick={reset}>{dict.common.retry}</Button>
    </div>
  );
}
