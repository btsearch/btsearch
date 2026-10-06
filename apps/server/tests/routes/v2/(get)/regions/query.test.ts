import { regionListQuerySchema } from "@openbts/shared/contract";
import { describe, expect, it } from "vitest";

describe("regionListQuerySchema", () => {
  it.each([{}, { countryCodes: "PL,US" }, { latitude: "0", longitude: "0" }, { bbox: "170,-10,-170,10", countryCodes: "US" }])(
    "accepts a complete supported region selector %j",
    (query) => {
      expect(regionListQuerySchema.safeParse(query).success).toBe(true);
    },
  );

  it.each([
    { latitude: "0" },
    { longitude: "0" },
    { bbox: "0,0,1,1", latitude: "0", longitude: "0" },
    { bbox: "0,0,1,1", latitude: "0" },
    { bbox: "0,0,1,1", longitude: "0" },
    { unknown: "value" },
  ])("rejects incomplete or contradictory region selectors %j", (query) => {
    expect(regionListQuerySchema.safeParse(query).success).toBe(false);
  });

  it("coerces a coordinate pair together and preserves country selection", () => {
    expect(regionListQuerySchema.parse({ latitude: "52.2297", longitude: "21.0122", countryCodes: "PL" })).toEqual({
      latitude: 52.2297,
      longitude: 21.0122,
      countryCodes: ["PL"],
    });
  });
});
