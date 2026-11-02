import { describe, expect, it } from "vitest";
import { adminHrefFor, contributionCoordinates, contributionFields, excerpt, osmViewUrl } from "../src/lib/domain/review-summary";

describe("review summaries", () => {
  it("collapses whitespace and bounds excerpts", () => {
    expect(excerpt("  a \n\n b   c ")).toBe("a b c");
    expect(excerpt("x".repeat(500), 50)?.length).toBe(50);
    expect(excerpt("x".repeat(500), 50)?.endsWith("…")).toBe(true);
    expect(excerpt("   ")).toBeNull();
    expect(excerpt(42)).toBeNull();
    expect(excerpt(null)).toBeNull();
  });

  it("lists known contribution fields first, in a stable order", () => {
    const fields = contributionFields({ description: "Nice", country: "Morocco", name: "Café", city: "Marrakech" });
    expect(fields.map((f) => f.key)).toEqual(["name", "city", "country", "description"]);
  });

  it("shows a few simple extras but never nested objects or coordinates", () => {
    const fields = contributionFields({ name: "A", lat: 1, lng: 2, nested: { a: 1 }, list: [1], a1: "x", a2: "y", a3: "z", a4: "w", a5: "v" });
    const keys = fields.map((f) => f.key);
    expect(keys).not.toContain("lat");
    expect(keys).not.toContain("nested");
    expect(keys).not.toContain("list");
    expect(keys.filter((k) => k !== "name")).toHaveLength(4);
  });

  it("tolerates junk payloads", () => {
    expect(contributionFields(null)).toEqual([]);
    expect(contributionFields("text")).toEqual([]);
    expect(contributionFields([1, 2])).toEqual([]);
  });

  it("reads usable coordinates and rejects missing, partial or null-island ones", () => {
    expect(contributionCoordinates({ lat: 31.6, lng: -8 })).toEqual({ lat: 31.6, lng: -8 });
    expect(contributionCoordinates({ name: "A" })).toBeNull();
    expect(contributionCoordinates({ lat: 31.6 })).toBeNull();
    expect(contributionCoordinates({ lat: "31.6", lng: "-8" })).toBeNull();
    expect(contributionCoordinates({ lat: 0, lng: 0 })).toBeNull();
    expect(contributionCoordinates({ lat: 200, lng: 0 })).toBeNull();
  });

  it("builds an OpenStreetMap link and admin hrefs", () => {
    expect(osmViewUrl(31.6, -8)).toBe("https://www.openstreetmap.org/?mlat=31.6&mlon=-8#map=18/31.6/-8");
    expect(adminHrefFor("place", "abc")).toBe("/control-room/places/abc");
    expect(adminHrefFor("review", "abc")).toBe("/control-room/reviews");
    expect(adminHrefFor("nope", "abc")).toBeNull();
  });
});
