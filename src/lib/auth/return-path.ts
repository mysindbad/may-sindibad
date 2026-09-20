export function sanitizeReturnPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  const value = raw.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.length > 2048) return fallback;

  try {
    const parsed = new URL(value, "https://my-sindbad.invalid");
    if (parsed.origin !== "https://my-sindbad.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function buildLoginPath(locale: string, returnPath?: string | null): string {
  const base = `/${locale}/login`;
  const safe = sanitizeReturnPath(returnPath, `/${locale}`);
  return safe === `/${locale}` ? base : `${base}?next=${encodeURIComponent(safe)}`;
}
