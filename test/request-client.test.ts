import { describe, expect, it } from "vitest";
import { clientIpFromRequest } from "../src/lib/request-client";

describe("client IP normalization", () => {
  it("accepts valid proxy IPs and takes only the first forwarded address", () => {
    expect(clientIpFromRequest(new Request("https://example.test", { headers: { "x-forwarded-for": "203.0.113.4, 10.0.0.2" } }))).toBe("203.0.113.4");
    expect(clientIpFromRequest(new Request("https://example.test", { headers: { "x-real-ip": "2001:db8::1" } }))).toBe("2001:db8::1");
  });

  it("rejects malformed or oversized values", () => {
    expect(clientIpFromRequest(new Request("https://example.test", { headers: { "x-forwarded-for": "not-an-ip" } }))).toBeNull();
    expect(clientIpFromRequest(new Request("https://example.test", { headers: { "x-real-ip": "1".repeat(100) } }))).toBeNull();
  });
});
