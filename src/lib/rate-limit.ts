import "server-only";
import { createHash } from "node:crypto";
import { pool } from "@/db";
import { clientIpFromRequest } from "@/lib/request-client";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

let lastCleanupAt = 0;

/**
 * Shared PostgreSQL fixed-window limiter. The key is SHA-256 hashed before it
 * reaches storage so user ids/IP-derived keys are not persisted in plaintext.
 * The single UPSERT is the concurrency authority across server instances.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error("Rate-limit `limit` must be a positive safe integer.");
  if (!Number.isSafeInteger(windowMs) || windowMs < 1000) throw new Error("Rate-limit window must be at least one second.");

  const now = Date.now();
  const nextReset = new Date(now + windowMs);
  const keyHash = createHash("sha256").update(key).digest("hex");

  const result = await pool.query<{ count: number; reset_at: Date }>(
    `INSERT INTO rate_limit_buckets (key_hash, count, reset_at, updated_at)
     VALUES ($1, 1, $2, NOW())
     ON CONFLICT (key_hash) DO UPDATE SET
       count = CASE
         WHEN rate_limit_buckets.reset_at <= NOW() THEN 1
         ELSE rate_limit_buckets.count + 1
       END,
       reset_at = CASE
         WHEN rate_limit_buckets.reset_at <= NOW() THEN EXCLUDED.reset_at
         ELSE rate_limit_buckets.reset_at
       END,
       updated_at = NOW()
     RETURNING count, reset_at`,
    [keyHash, nextReset],
  );

  const row = result.rows[0];
  if (!row) throw new Error("Rate limiter failed to return bucket state.");
  const count = Number(row.count);
  const resetAt = new Date(row.reset_at).getTime();

  // Opportunistic bounded cleanup. This timestamp is only an efficiency guard;
  // correctness comes from the shared PostgreSQL row above. Cleanup failures do
  // not weaken an already-recorded limit decision.
  if (now - lastCleanupAt >= 60 * 60 * 1000) {
    lastCleanupAt = now;
    void pool
      .query(`DELETE FROM rate_limit_buckets WHERE reset_at < NOW() - INTERVAL '1 day'`)
      .catch((error) => console.warn("Rate-limit cleanup failed", error instanceof Error ? error.message : "unknown_error"));
  }

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  };
}

export function clientKeyFromRequest(request: Request, scope: string): string {
  return `${scope}:${clientIpFromRequest(request) ?? "unknown"}`;
}
