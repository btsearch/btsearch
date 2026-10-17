import { regionListQuerySchema } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

describe("regionListQuerySchema", () => {
  it("accepts a bounding box together with country codes", () => {
    expect(regionListQuerySchema.safeParse({ bbox: "170,-10,-170,10", countryCodes: "US" }).success).toBe(true);
  });

  it("rejects an unknown query field", () => {
    expect(regionListQuerySchema.safeParse({ unknown: "value" }).success).toBe(false);
  });
});
