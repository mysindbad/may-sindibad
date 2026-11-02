"use client";

import { useState, type ReactNode } from "react";

/**
 * A place's real photo, or the supplied fallback when there is none or the URL
 * no longer loads - a broken-image icon would look like a bug, and a faked
 * photo would mislead. Remote cover photos come from arbitrary hosts (upload
 * storage or an admin-verified external URL), so the Next image loader's fixed
 * domain list does not apply and a plain <img> is used on purpose.
 */
export function PlaceImage({
  src,
  className,
  fallback,
  priority = false,
}: {
  src: string | null | undefined;
  className?: string;
  fallback: ReactNode;
  priority?: boolean;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- see component comment.
    <img
      src={src}
      alt=""
      className={className}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
    />
  );
}
