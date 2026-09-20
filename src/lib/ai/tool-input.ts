export type AiToolTextResult =
  | { ok: true; value?: string }
  | { ok: false; reason: "required" | "invalid" | "too_long" };

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u;

/**
 * AI tool arguments are untrusted model output. Keep them behind the same
 * small, deterministic boundaries we would apply to public search input before
 * they reach the database.
 */
export function normalizeAiToolText(value: unknown, maxLength: number, required = false): AiToolTextResult {
  if (value === undefined || value === null) {
    return required ? { ok: false, reason: "required" } : { ok: true, value: undefined };
  }
  if (typeof value !== "string") return { ok: false, reason: "invalid" };

  const normalized = value.trim();
  if (!normalized) return required ? { ok: false, reason: "required" } : { ok: true, value: undefined };
  if (normalized.length > maxLength) return { ok: false, reason: "too_long" };
  if (CONTROL_CHARACTERS.test(normalized)) return { ok: false, reason: "invalid" };

  return { ok: true, value: normalized };
}

/** Escape PostgreSQL LIKE/ILIKE wildcard characters so model-generated text
 * is searched literally rather than being able to expand a lookup to `%`/`_`.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
