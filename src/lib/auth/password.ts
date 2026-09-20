// Pure password hashing utilities (no DB / Next.js imports) so they can be
// unit-tested in isolation. Uses Node's built-in scrypt — no extra
// dependency or native binding is required.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

// OWASP's current scrypt guidance includes N=2^15, r=8, p=3 as one of the
// minimum-equivalent parameter sets. Persist the parameters with the hash so
// future upgrades remain backwards-compatible rather than silently changing
// how an existing password is verified.
const SCRYPT_N = 2 ** 15;
const SCRYPT_R = 8;
const SCRYPT_P = 3;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;
const CURRENT_PREFIX = "scrypt2";
const LEGACY_PREFIX = "scrypt";
const TIMING_FLOOR_SALT = "7f6f0a2e5e9d6b1f1a77c3c74eea9124";

function deriveKey(plainPassword: string, salt: string, N: number, r: number, p: number): Buffer {
  return scryptSync(plainPassword, salt, KEY_LENGTH, {
    N,
    r,
    p,
    maxmem: Math.max(SCRYPT_MAXMEM, 128 * N * r + 1024 * 1024),
  });
}

export function hashPassword(plainPassword: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const derivedKey = deriveKey(plainPassword, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P).toString("hex");
  return `${CURRENT_PREFIX}:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt}:${derivedKey}`;
}

export function verifyPassword(plainPassword: string, storedHash: string): boolean {
  const parts = storedHash.split(":");

  if (parts[0] === CURRENT_PREFIX) {
    if (parts.length !== 6) return false;
    const [, nRaw, rRaw, pRaw, salt, key] = parts;
    const N = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);

    // Accept only bounded, structurally valid values. The parameters are read
    // from storage for upgrade compatibility, so unbounded values must never
    // be allowed to turn a corrupted/hostile DB row into a CPU/RAM DoS.
    if (!Number.isInteger(N) || N < 2 ** 13 || N > 2 ** 18 || (N & (N - 1)) !== 0) return false;
    if (!Number.isInteger(r) || r < 1 || r > 16) return false;
    if (!Number.isInteger(p) || p < 1 || p > 10) return false;
    if (!new RegExp(`^[0-9a-f]{${SALT_BYTES * 2}}$`, "i").test(salt)) return false;
    if (!new RegExp(`^[0-9a-f]{${KEY_LENGTH * 2}}$`, "i").test(key)) return false;

    const keyBuffer = Buffer.from(key, "hex");
    if (keyBuffer.length !== KEY_LENGTH) return false;
    try {
      const derivedKey = deriveKey(plainPassword, salt, N, r, p);
      return timingSafeEqual(derivedKey, keyBuffer);
    } catch {
      return false;
    }
  }

  // Backward compatibility for accounts created before parameterized hashes
  // were introduced. Node's historical scrypt defaults were used for these.
  // Successful legacy logins are transparently re-hashed by the login route.
  if (parts[0] === LEGACY_PREFIX) {
    if (parts.length !== 3) return false;
    const [, salt, key] = parts;
    if (!new RegExp(`^[0-9a-f]{${SALT_BYTES * 2}}$`, "i").test(salt)) return false;
    if (!new RegExp(`^[0-9a-f]{${KEY_LENGTH * 2}}$`, "i").test(key)) return false;

    const keyBuffer = Buffer.from(key, "hex");
    if (keyBuffer.length !== KEY_LENGTH) return false;
    try {
      const derivedKey = scryptSync(plainPassword, salt, KEY_LENGTH);
      return timingSafeEqual(derivedKey, keyBuffer);
    } catch {
      return false;
    }
  }

  return false;
}

export function passwordHashNeedsUpgrade(storedHash: string): boolean {
  const parts = storedHash.split(":");
  if (parts.length !== 6 || parts[0] !== CURRENT_PREFIX) return true;
  return Number(parts[1]) !== SCRYPT_N || Number(parts[2]) !== SCRYPT_R || Number(parts[3]) !== SCRYPT_P;
}

/**
 * Spend one current-work-factor derivation when no current hash was verified.
 * Login uses this for missing/Google-only/legacy/malformed accounts so a wrong
 * password does not trivially reveal account existence by being much faster.
 */
export function consumePasswordVerificationWork(plainPassword: string): void {
  deriveKey(plainPassword, TIMING_FLOOR_SALT, SCRYPT_N, SCRYPT_R, SCRYPT_P);
}

export function isPasswordStrongEnough(plainPassword: string): boolean {
  return typeof plainPassword === "string" && plainPassword.length >= 8;
}
