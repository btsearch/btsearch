import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { findPlacementCountryCode, placementCountryCode } from "../../../src/features/stations/country.js";
import { findPlacementCountryFeatures, getCountryFeaturesByCode, getStationCountryFeatures } from "../../../src/features/stations/countryFeatures.js";
import { dbMock } from "../../helpers/boundaries.js";

describe("getCountryFeaturesByCode", () => {
  it("keeps owner proposals, PSC and BSIC independent for each country", async () => {
    dbMock.enqueueCountryFeatures("countries", [
      { code: "PL", structureOwnerProposals: true, psc: true, bsic: false },
      { code: "DE", structureOwnerProposals: false, psc: false, bsic: true },
    ]);

    const features = await getCountryFeaturesByCode(["PL", "DE", "PL", null, undefined]);

    expect(features.get("PL")).toEqual({ structureOwnerProposals: true, psc: true, bsic: false });
    expect(features.get("DE")).toEqual({ structureOwnerProposals: false, psc: false, bsic: true });
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it("avoids a database query when no country is known", async () => {
    expect(await getCountryFeaturesByCode([null, undefined])).toEqual(new Map());
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("propagates a failed country lookup", async () => {
    dbMock.enqueueCountryFeatures("countries", new Error("Country lookup failed"));

    await expect(getCountryFeaturesByCode(["PL"])).rejects.toThrow("Country lookup failed");
  });
});

describe("findPlacementCountryCode", () => {
  it("uses the destination region before the existing location and the new operator", async () => {
    dbMock.enqueueFor("select", "regions", [{ countryCode: "DE" }]);
    dbMock.enqueueFor("select", "stations", [{ locationCountry: "PL", operatorCountry: "FR" }]);
    dbMock.enqueueFor("select", "operators", [{ countryCode: "CZ" }]);

    expect(await findPlacementCountryCode({ stationId: 1, regionId: 2, operatorId: 3 })).toBe("DE");
  });

  it("uses the existing location before a replacement operator", async () => {
    dbMock.enqueueFor("select", "stations", [{ locationCountry: "PL", operatorCountry: "FR" }]);
    dbMock.enqueueFor("select", "operators", [{ countryCode: "CZ" }]);

    expect(await findPlacementCountryCode({ stationId: 1, operatorId: 3 })).toBe("PL");
  });

  it("falls back to the replacement operator when the location is detached", async () => {
    dbMock.enqueueFor("select", "stations", [{ locationCountry: "PL", operatorCountry: "FR" }]);
    dbMock.enqueueFor("select", "operators", [{ countryCode: "CZ" }]);

    expect(await findPlacementCountryCode({ stationId: 1, operatorId: 3, withoutLocation: true })).toBe("CZ");
  });

  it("falls back to the station operator when no region is known", async () => {
    dbMock.enqueueFor("select", "stations", [{ locationCountry: null, operatorCountry: "PL" }]);

    expect(await findPlacementCountryCode({ stationId: 1 })).toBe("PL");
  });
});

describe("findPlacementCountryFeatures", () => {
  it("loads the features of the final placement country", async () => {
    dbMock.enqueueCountryFeatures("countries", [{ structureOwnerProposals: false, psc: false, bsic: true }]);

    expect(await findPlacementCountryFeatures({ stationId: 1, regionId: 2 })).toEqual({
      structureOwnerProposals: false,
      psc: false,
      bsic: true,
    });
  });

  it("disables optional features when no country can be resolved", async () => {
    expect(await findPlacementCountryFeatures({ stationId: null })).toEqual({ structureOwnerProposals: false, psc: false, bsic: false });
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("disables optional features when the resolved country does not exist", async () => {
    dbMock.enqueueCountryFeatures("countries", []);

    expect(await findPlacementCountryFeatures({ stationId: null, regionId: 1 })).toEqual({ structureOwnerProposals: false, psc: false, bsic: false });
  });
});

describe("getStationCountryFeatures", () => {
  it("loads several stations in one query without depending on included location data", async () => {
    dbMock.enqueueCountryFeatures("stations", [
      { stationId: 1, structureOwnerProposals: true, psc: true, bsic: false },
      { stationId: 2, structureOwnerProposals: false, psc: false, bsic: true },
      { stationId: 3, structureOwnerProposals: null, psc: null, bsic: null },
    ]);

    const features = await getStationCountryFeatures([1, 2, 3, 1]);

    expect(features.get(1)).toEqual({ structureOwnerProposals: true, psc: true, bsic: false });
    expect(features.get(2)).toEqual({ structureOwnerProposals: false, psc: false, bsic: true });
    expect(features.get(3)).toEqual({ structureOwnerProposals: false, psc: false, bsic: false });
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it("avoids a query for an empty station list", async () => {
    expect(await getStationCountryFeatures([])).toEqual(new Map());
    expect(dbMock.select).not.toHaveBeenCalled();
  });
});

describe("placementCountryCode", () => {
  it("queries destination region, current location, proposed operator and current operator in priority order", () => {
    const query = new PgDialect().sqlToQuery(placementCountryCode({ stationId: 1, regionId: 2, operatorId: 3 }));

    expect(query.params).toEqual([2, 1, 3, 1]);
    expect(query.sql).toMatch(/^COALESCE\(/);
    expect(query.sql.indexOf('"regions"')).toBeLessThan(query.sql.indexOf('"locations"'));
    expect(query.sql.indexOf('"locations"')).toBeLessThan(query.sql.indexOf('"operators"'));
  });

  it("omits the current location when a station is detached", () => {
    const query = new PgDialect().sqlToQuery(placementCountryCode({ stationId: 1, operatorId: 3, withoutLocation: true }));

    expect(query.params).toEqual([3, 1]);
    expect(query.sql).not.toContain('"locations"');
  });
});
