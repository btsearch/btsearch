import { describe, expect, it } from "vitest";

import { assertRealBand } from "../../../src/features/bands/write.js";

describe("assertRealBand", () => {
  it.each([
    { rat: "GSM", value: 900, duplex: null },
    { rat: "UMTS", value: 900, duplex: "FDD" },
    { rat: "LTE", value: 2600, duplex: "TDD" },
    { rat: "NR", value: 700, duplex: "SDL" },
    { rat: "LTE", value: 0, duplex: null },
  ] as const)("accepts real bands and parked unknown placeholders: %j", (band) => {
    expect(() => assertRealBand(band)).not.toThrow();
  });

  it.each([
    { rat: "CDMA", value: 420, duplex: "FDD" },
    { rat: "IOT", value: 0, duplex: null },
    { rat: "UMTS", value: 900, duplex: null },
    { rat: "LTE", value: 1800 },
    { rat: "NR", value: null, duplex: null },
  ] as const)("rejects permit labels and missing duplex modes: %j", (band) => {
    expect(() => assertRealBand(band)).toThrow(expect.objectContaining({ code: "BAD_REQUEST", statusCode: 400 }));
  });
});
