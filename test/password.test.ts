import { describe, expect, it } from "vitest";
import { scryptSync } from "node:crypto";
import { consumePasswordVerificationWork, hashPassword, passwordHashNeedsUpgrade, verifyPassword } from "../src/lib/auth/password";

describe("password hashing", () => {
  it("creates a parameterized current scrypt hash and verifies it", () => {
    const hash = hashPassword("Correct Horse Battery Staple");
    expect(hash.startsWith("scrypt2:32768:8:3:")).toBe(true);
    expect(passwordHashNeedsUpgrade(hash)).toBe(false);
    expect(verifyPassword("Correct Horse Battery Staple", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });

  it("continues to verify legacy hashes and marks them for rehash", () => {
    const salt = "11".repeat(16);
    const key = scryptSync("legacy-password", salt, 64).toString("hex");
    const legacy = `scrypt:${salt}:${key}`;
    expect(verifyPassword("legacy-password", legacy)).toBe(true);
    expect(verifyPassword("wrong", legacy)).toBe(false);
    expect(passwordHashNeedsUpgrade(legacy)).toBe(true);
  });

  it("can spend the current verification work factor for non-current account paths", () => {
    expect(() => consumePasswordVerificationWork("unknown-account-password")).not.toThrow();
  });

  it("fails closed for malformed, truncated or abusive stored hashes", () => {
    expect(verifyPassword("anything", "scrypt:salt:")).toBe(false);
    expect(verifyPassword("anything", "scrypt:00000000000000000000000000000000:")).toBe(false);
    expect(verifyPassword("anything", "scrypt:00000000000000000000000000000000:zz")).toBe(false);
    expect(verifyPassword("anything", "not-scrypt:00000000000000000000000000000000:" + "00".repeat(64))).toBe(false);
    expect(verifyPassword("anything", `scrypt2:1073741824:8:1:${"00".repeat(16)}:${"00".repeat(64)}`)).toBe(false);
    expect(verifyPassword("anything", `scrypt2:32768:999:1:${"00".repeat(16)}:${"00".repeat(64)}`)).toBe(false);
  });
});
