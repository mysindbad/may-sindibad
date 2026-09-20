import { describe, expect, it } from "vitest";
import { haversineKm } from "../src/lib/geo/distance";

describe("geo distance", () => {
  it("returns approximately zero for identical coordinates", () => {
    expect(haversineKm({ lat: 31.63, lng: -7.98 }, { lat: 31.63, lng: -7.98 })).toBeCloseTo(0, 6);
  });

  it("computes realistic city-scale distance", () => {
    const km = haversineKm({ lat: 31.6295, lng: -7.9811 }, { lat: 33.5731, lng: -7.5898 });
    expect(km).toBeGreaterThan(200);
    expect(km).toBeLessThan(260);
  });
});
