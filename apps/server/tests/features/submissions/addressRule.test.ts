import type { SubmissionCreate } from "@openbts/shared/contract";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { toDirectChange, toSingleSubmission, toSubmissionUpdateInput } from "../../../src/features/submissions/translate.js";
import { dbMock } from "../../helpers/boundaries.js";

type Region = { id: number; countryCode: string };

const OWN_ADDRESS = "teren własny";
const submissionId = "11111111-1111-4111-8111-111111111111";
const polishRegion: Region = { id: 1, countryCode: "PL" };
const germanRegion: Region = { id: 2, countryCode: "DE" };
const storedLocation = { stationId: 1, region_id: polishRegion.id, latitude: 52, longitude: 21 };
const dialect = new PgDialect();

function refusalAt(field: string) {
  return {
    code: "VALIDATION_ERROR",
    statusCode: 400,
    message: "Validation error.",
    details: [{ field, validationMessage: "Address must not contain variants of własny" }],
  };
}

function newStation(named: Region, address: string | undefined = OWN_ADDRESS): SubmissionCreate {
  return { action: "create", station: { siteId: "site-1", operatorId: 1 }, location: { regionId: named.id, latitude: 52, longitude: 21, address } };
}

function scriptReferences(named: Region): void {
  dbMock.enqueueFor("select", "operators", [{ id: 1 }]);
  dbMock.enqueueFor("select", "regions", [{ id: named.id }]);
}

function scriptFiling(filed: Region): void {
  dbMock.enqueueFor("execute", undefined, [{ regionId: filed.id }]);
  dbMock.enqueueFor("select", "regions", [{ countryCode: filed.countryCode }]);
}

function scriptNewStation(named: Region, filed: Region, operatorCountry = "PL"): void {
  scriptReferences(named);
  scriptFiling(filed);
  dbMock.enqueueFor("select", "operators", [{ countryCode: operatorCountry }]);
}

function scriptStoredPlacement(stored: Region): void {
  dbMock.enqueueSubmissionPlacement([{ regionId: stored.id, operatorId: 1 }]);
  dbMock.enqueueFor("select", "regions", [{ countryCode: stored.countryCode }]);
  dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }]);
}

function scriptStoredStation(locationCountry: string | null, operatorCountry = "PL"): void {
  dbMock.enqueueFor("select", "stations", [{ locationCountry, operatorCountry }]);
}

function coordinateLookups(): unknown[][] {
  const lookups = dbMock.calls.filter((call) => call.operation === "execute");
  return lookups.map((call) => dialect.sqlToQuery(call.clauses.statement?.[0] as SQL).params);
}

function regionLookups(): unknown[][] {
  const lookups = dbMock.calls.filter((call) => call.operation === "select" && call.table === "regions");
  return lookups.map((call) => dialect.sqlToQuery(call.clauses.where?.[0] as SQL).params);
}

describe("toSingleSubmission", () => {
  it("refuses a Polish location's address at its field", async () => {
    scriptNewStation(polishRegion, polishRegion);

    await expect(toSingleSubmission(newStation(polishRegion))).rejects.toMatchObject(refusalAt("location/address"));
  });

  it("points the refusal at the change's place in the request", async () => {
    scriptNewStation(polishRegion, polishRegion);

    await expect(toSingleSubmission(newStation(polishRegion), (path) => [3, ...path])).rejects.toMatchObject(refusalAt("3/location/address"));
  });

  it("refuses the address when the request names a region elsewhere but the coordinates fall in Poland", async () => {
    scriptNewStation(germanRegion, polishRegion, "DE");

    await expect(toSingleSubmission(newStation(germanRegion))).rejects.toMatchObject(refusalAt("location/address"));
    expect(coordinateLookups()).toEqual([[0, 21, 52, germanRegion.id]]);
    expect(regionLookups()).toEqual([[germanRegion.id], [polishRegion.id]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("accepts the address when the request names a Polish region but the coordinates fall in a country without a pack", async () => {
    scriptNewStation(polishRegion, germanRegion);

    expect((await toSingleSubmission(newStation(polishRegion))).location).toMatchObject({ region_id: polishRegion.id, address: OWN_ADDRESS });
    expect(regionLookups()).toEqual([[polishRegion.id], [germanRegion.id]]);
  });

  it("goes by the country of the location, not of the operator", async () => {
    scriptNewStation(polishRegion, polishRegion, "DE");
    await expect(toSingleSubmission(newStation(polishRegion))).rejects.toMatchObject(refusalAt("location/address"));

    scriptNewStation(germanRegion, germanRegion, "PL");
    expect((await toSingleSubmission(newStation(germanRegion))).location).toMatchObject({ region_id: germanRegion.id, address: OWN_ADDRESS });
  });

  it("accepts another address in Poland", async () => {
    scriptNewStation(polishRegion, polishRegion);

    expect((await toSingleSubmission(newStation(polishRegion, "Własnościowa 4"))).location).toMatchObject({ address: "Własnościowa 4" });
  });

  it("reads no country code when neither an address nor cells are sent", async () => {
    scriptReferences(polishRegion);
    dbMock.enqueueFor("execute", undefined, [{ regionId: polishRegion.id }]);

    await toSingleSubmission({ ...newStation(polishRegion), location: { regionId: polishRegion.id, latitude: 52, longitude: 21 } });

    expect(coordinateLookups()).toEqual([[0, 21, 52, polishRegion.id]]);
    expect(regionLookups()).toEqual([[polishRegion.id]]);
    expect(dbMock.pendingResults()).toBe(0);
  });
});

describe("toSubmissionUpdateInput", () => {
  it("refuses the address by the country of the region the submission already proposes", async () => {
    scriptStoredPlacement(polishRegion);

    await expect(toSubmissionUpdateInput(null, { location: { address: OWN_ADDRESS } }, { submissionId })).rejects.toMatchObject(
      refusalAt("location/address"),
    );
  });

  it("accepts the same address when that region is in a country without a pack", async () => {
    scriptStoredPlacement(germanRegion);

    const translated = await toSubmissionUpdateInput(null, { location: { address: OWN_ADDRESS } }, { submissionId });

    expect(translated.location).toMatchObject({ region_id: germanRegion.id, address: OWN_ADDRESS });
  });

  it("refuses the address when the edit names a region elsewhere but sends coordinates that fall in Poland", async () => {
    dbMock.enqueueSubmissionPlacement([{ regionId: germanRegion.id, operatorId: 1 }]);
    dbMock.enqueueFor("select", "regions", [{ id: germanRegion.id }]);
    scriptFiling(polishRegion);
    dbMock.enqueueFor("select", "operators", [{ countryCode: "DE" }]);

    const location = { regionId: germanRegion.id, latitude: 52, longitude: 21, address: OWN_ADDRESS };
    await expect(toSubmissionUpdateInput(null, { location }, { submissionId })).rejects.toMatchObject(refusalAt("location/address"));
    expect(coordinateLookups()).toEqual([[0, 21, 52, germanRegion.id]]);
    expect(dbMock.pendingResults()).toBe(0);
  });
});

describe("toDirectChange", () => {
  it.each([
    { title: "a station at a Polish location", locationCountry: "PL", operatorCountry: "DE" },
    { title: "a Polish operator's station without a location", locationCountry: null, operatorCountry: "PL" },
  ])("refuses the address for $title", async ({ locationCountry, operatorCountry }) => {
    scriptStoredStation(locationCountry, operatorCountry);

    await expect(toDirectChange({ action: "update", stationId: 1, location: { address: OWN_ADDRESS } })).rejects.toMatchObject(
      refusalAt("location/address"),
    );
    expect(coordinateLookups()).toEqual([]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("accepts the same address for a station at a location in a country without a pack", async () => {
    scriptStoredStation("DE");

    const change = await toDirectChange({ action: "update", stationId: 1, location: { address: OWN_ADDRESS } });

    expect(change.location).toMatchObject({ address: OWN_ADDRESS });
  });

  it("refuses the address when a region elsewhere is named for a station that stays at its Polish location", async () => {
    dbMock.enqueueFor("select", "regions", [{ id: germanRegion.id }]);
    dbMock.enqueueFor("select", "stations", [storedLocation]);
    scriptStoredStation("PL");
    scriptFiling(polishRegion);

    const location = { regionId: germanRegion.id, address: OWN_ADDRESS };
    await expect(toDirectChange({ action: "update", stationId: 1, location })).rejects.toMatchObject(refusalAt("location/address"));
    expect(coordinateLookups()).toEqual([[0, storedLocation.longitude, storedLocation.latitude, germanRegion.id]]);
    expect(regionLookups()).toEqual([[germanRegion.id], [polishRegion.id]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("goes by the region a station moves to", async () => {
    dbMock.enqueueFor("select", "regions", [{ id: germanRegion.id }]);
    scriptStoredStation("PL");
    scriptFiling(germanRegion);

    const location = { regionId: germanRegion.id, latitude: 52, longitude: 13, address: OWN_ADDRESS };
    const change = await toDirectChange({ action: "update", stationId: 1, location });

    expect(change.location).toMatchObject({ region_id: germanRegion.id, address: OWN_ADDRESS });
    expect(coordinateLookups()).toEqual([[0, 13, 52, germanRegion.id]]);
  });

  it("files a moved station by its new coordinates when the request names no region", async () => {
    dbMock.enqueueFor("select", "stations", [{ regionId: polishRegion.id }]);
    scriptStoredStation("PL");
    scriptFiling(germanRegion);

    const change = await toDirectChange({ action: "update", stationId: 1, location: { latitude: 52, longitude: 13, address: OWN_ADDRESS } });

    expect(change.location).toMatchObject({ region_id: germanRegion.id, address: OWN_ADDRESS });
    expect(coordinateLookups()).toEqual([[0, 13, 52, polishRegion.id]]);
    expect(dbMock.pendingResults()).toBe(0);
  });
});
