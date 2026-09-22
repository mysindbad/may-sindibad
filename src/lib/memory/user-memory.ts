import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { userMemories } from "@/db/schema";

// What Sindbad is allowed to remember about a traveller between trips.
//
// The hard line this module draws: memory holds facts about the *person*,
// never facts about the *world*. "Prefers quiet places" stays true next year;
// "the museum costs 70 MAD" does not, and storing it would let Sindbad quote a
// stale price back as current. Anything time-sensitive is looked up live by a
// tool instead.

export const MEMORY_KINDS = [
  "preference",
  "interest",
  "avoid",
  "companion",
  "budget_style",
  "constraint",
] as const;

export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** A bounded memory stays useful; an unbounded one becomes noise in the prompt. */
export const MAX_MEMORIES_PER_USER = 40;
export const MAX_MEMORY_VALUE_LENGTH = 200;
const MAX_MEMORY_KEY_LENGTH = 80;

export interface UserMemory {
  id: string;
  kind: MemoryKind;
  key: string;
  value: string;
  source: "stated" | "observed";
  updatedAt: Date;
}

export function isMemoryKind(value: string): value is MemoryKind {
  return (MEMORY_KINDS as readonly string[]).includes(value);
}

/**
 * Phrases that indicate a world fact rather than a personal one. A model
 * asked to "remember that the riad costs 800 dirhams" is trying to cache
 * something that expires, so the write is refused rather than silently kept.
 */
const WORLD_FACT_PATTERNS: RegExp[] = [
  /\b\d+\s*(mad|usd|eur|dh|dirham|dollar|euro)\b/i,
  /\b(price|cost|costs|fee|rate|tariff|سعر|ثمن|تكلفة|التكلفة)\b/i,
  /\b(weather|forecast|temperature|طقس|حرارة)\b/i,
  /\b(open now|opening hours|closed|availability|مفتوح|مغلق|متاح)\b/i,
  /\b(today|tonight|this week|tomorrow|اليوم|غدا|غدًا|الليلة)\b/i,
];

export type MemoryRejection = "empty" | "too_long" | "world_fact" | "limit_reached";

export function classifyMemoryValue(value: string): MemoryRejection | null {
  const trimmed = value.trim();
  if (!trimmed) return "empty";
  if (trimmed.length > MAX_MEMORY_VALUE_LENGTH) return "too_long";
  if (WORLD_FACT_PATTERNS.some((pattern) => pattern.test(trimmed))) return "world_fact";
  return null;
}

function normalizeKey(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .slice(0, MAX_MEMORY_KEY_LENGTH);
}

/** Everything Sindbad knows about this traveller, oldest first. */
export async function listMemories(userId: string): Promise<UserMemory[]> {
  const rows = await db
    .select({
      id: userMemories.id,
      kind: userMemories.kind,
      key: userMemories.memoryKey,
      value: userMemories.value,
      source: userMemories.source,
      updatedAt: userMemories.updatedAt,
    })
    .from(userMemories)
    .where(eq(userMemories.userId, userId))
    .orderBy(asc(userMemories.createdAt))
    .limit(MAX_MEMORIES_PER_USER);

  return rows.map((row) => ({
    id: row.id,
    kind: (isMemoryKind(row.kind) ? row.kind : "preference") as MemoryKind,
    key: row.key,
    value: row.value,
    source: row.source === "observed" ? "observed" : "stated",
    updatedAt: row.updatedAt,
  }));
}

export type RememberResult =
  | { ok: true; memory: UserMemory; replaced: boolean }
  | { ok: false; reason: MemoryRejection };

/**
 * Store or update one durable preference. Re-stating the same key overwrites
 * it, so "actually I prefer mid-range now" corrects the old answer instead of
 * leaving two contradictory memories for the model to choose between.
 */
export async function rememberPreference(input: {
  userId: string;
  kind: MemoryKind;
  key: string;
  value: string;
  source?: "stated" | "observed";
}): Promise<RememberResult> {
  const rejection = classifyMemoryValue(input.value);
  if (rejection) return { ok: false, reason: rejection };

  const key = normalizeKey(input.key);
  if (!key) return { ok: false, reason: "empty" };

  const existing = await db
    .select({ id: userMemories.id })
    .from(userMemories)
    .where(and(eq(userMemories.userId, input.userId), eq(userMemories.kind, input.kind), eq(userMemories.memoryKey, key)))
    .limit(1);

  if (existing.length === 0) {
    const current = await db
      .select({ id: userMemories.id })
      .from(userMemories)
      .where(eq(userMemories.userId, input.userId));
    if (current.length >= MAX_MEMORIES_PER_USER) return { ok: false, reason: "limit_reached" };
  }

  const value = input.value.trim();
  const source = input.source ?? "stated";

  const [row] = await db
    .insert(userMemories)
    .values({ userId: input.userId, kind: input.kind, memoryKey: key, value, source })
    .onConflictDoUpdate({
      target: [userMemories.userId, userMemories.kind, userMemories.memoryKey],
      set: { value, source, updatedAt: new Date() },
    })
    .returning({
      id: userMemories.id,
      kind: userMemories.kind,
      key: userMemories.memoryKey,
      value: userMemories.value,
      source: userMemories.source,
      updatedAt: userMemories.updatedAt,
    });

  return {
    ok: true,
    replaced: existing.length > 0,
    memory: {
      id: row.id,
      kind: (isMemoryKind(row.kind) ? row.kind : "preference") as MemoryKind,
      key: row.key,
      value: row.value,
      source: row.source === "observed" ? "observed" : "stated",
      updatedAt: row.updatedAt,
    },
  };
}

/** Forget one memory. The traveller's own scope is enforced in the query. */
export async function forgetMemory(userId: string, memoryId: string): Promise<boolean> {
  const removed = await db
    .delete(userMemories)
    .where(and(eq(userMemories.id, memoryId), eq(userMemories.userId, userId)))
    .returning({ id: userMemories.id });
  return removed.length > 0;
}

export async function forgetAllMemories(userId: string): Promise<number> {
  const removed = await db.delete(userMemories).where(eq(userMemories.userId, userId)).returning({ id: userMemories.id });
  return removed.length;
}

/**
 * Compact prompt line describing the traveller. Returns null when there is
 * nothing durable to say, so a new user's prompt is not padded with an empty
 * "what we know about you" section.
 */
export function describeMemories(memories: UserMemory[]): string | null {
  if (memories.length === 0) return null;
  const parts = memories.map((memory) => memory.key.replace(/_/g, " ") + ": " + memory.value);
  return parts.join("; ");
}
