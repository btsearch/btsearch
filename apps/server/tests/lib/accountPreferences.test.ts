import type { CloudPreferences } from "@openbts/drizzle";
import { describe, expect, it } from "vitest";

import { cloudPreferencesPatchSchema, normalizeCloudPreferences } from "../../src/lib/accountPreferences.js";

const storedMapFilters = {
  operatorIds: [3, 7],
  countryCodes: ["PL", "DE"],
  bands: [800, 2100],
  rat: ["lte"],
  status: ["published", "pending"],
  source: "internal",
  recentDays: null,
  recentDateFields: ["createdAt"],
  showStations: true,
  showRadiolines: false,
  radiolineOperators: [],
  showHeatmap: false,
  showPlannedMeasurements: false,
  showEstimatedSites: true,
  showTrails: false,
  estimatedSiteStatuses: ["unmatched"],
  uplinkTypes: ["fiber"],
};

describe("normalizeCloudPreferences map filters", () => {
  it("coerces the opt-in flag to a strict boolean", () => {
    expect(normalizeCloudPreferences({ syncMapFilters: "yes" } as unknown as CloudPreferences).syncMapFilters).toBe(false);
    expect(normalizeCloudPreferences({ syncMapFilters: true } as unknown as CloudPreferences).syncMapFilters).toBe(true);
  });

  it("keeps a stored bucket and its unknown keys", () => {
    const normalized = normalizeCloudPreferences({
      mapFiltersDesktop: { ...storedMapFilters, futureFilter: ["x"] },
    } as unknown as CloudPreferences);

    expect(normalized.mapFiltersDesktop).toEqual({ ...storedMapFilters, futureFilter: ["x"] });
    expect(normalized.mapFiltersMobile).toBeNull();
  });

  it("drops a bucket whose known key has the wrong type, keeping the other", () => {
    const normalized = normalizeCloudPreferences({
      mapFiltersDesktop: { ...storedMapFilters, operatorIds: "3,7" },
      mapFiltersMobile: storedMapFilters,
    } as unknown as CloudPreferences);

    expect(normalized.mapFiltersDesktop).toBeNull();
    expect(normalized.mapFiltersMobile).toEqual(storedMapFilters);
  });
});

describe("cloudPreferencesPatchSchema map filters", () => {
  it("accepts the opt-in flag with a full bucket", () => {
    expect(cloudPreferencesPatchSchema.safeParse({ syncMapFilters: true, mapFiltersDesktop: storedMapFilters }).success).toBe(true);
  });

  it("rejects a bucket whose known key has the wrong type", () => {
    expect(cloudPreferencesPatchSchema.safeParse({ mapFiltersDesktop: { countryCodes: ["Polska"] } }).success).toBe(false);
  });
});
