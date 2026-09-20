import { describe, expect, it } from "vitest";
import { buildLoginPath, sanitizeReturnPath } from "../src/lib/auth/return-path";

describe("auth return path safety", () => {
  it("preserves safe same-origin relative destinations", () => {
    expect(sanitizeReturnPath("/ar/bookings/123?payment=cancelled#top", "/ar")).toBe("/ar/bookings/123?payment=cancelled#top");
  });

  it("rejects protocol-relative, absolute and backslash redirects", () => {
    expect(sanitizeReturnPath("//evil.example", "/ar")).toBe("/ar");
    expect(sanitizeReturnPath("https://evil.example/path", "/ar")).toBe("/ar");
    expect(sanitizeReturnPath("/\\evil.example", "/ar")).toBe("/ar");
  });

  it("builds an encoded login redirect only when needed", () => {
    expect(buildLoginPath("ar", "/ar")).toBe("/ar/login");
    expect(buildLoginPath("ar", "/ar/bookings/abc?x=1")).toBe("/ar/login?next=%2Far%2Fbookings%2Fabc%3Fx%3D1");
  });
});
