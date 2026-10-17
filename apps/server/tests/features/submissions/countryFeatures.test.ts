import type { CellEditInput, CountryFeatures, SubmissionCreate } from "@openbts/shared/contract";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { toDirectChange, toSingleSubmission, toSubmissionUpdateInput } from "../../../src/features/submissions/translate.js";
import { dbMock } from "../../helpers/boundaries.js";

const NAMED_REGION_ID = 2;
const FILED_REGION_ID = 5;
const STATION_ID = 9;
const submissionId = "11111111-1111-4111-8111-111111111111";
const ownerCountry: CountryFeatures = { structureOwnerProposals: true, psc: true, bsic: false };
const closedCountry: CountryFeatures = { structureOwnerProposals: false, psc: false, bsic: true };
const countryKeepingNothing: CountryFeatures = { structureOwnerProposals: false, psc: false, bsic: false };
const pscCell = { action: "create", rat: "umts", bandId: 1, lac: 100, rnc: 1, cid: 1, uarfcn: 10564, psc: 73 } satisfies CellEditInput;
const bsicCell = { action: "create", rat: "gsm", bandId: 1, lac: 1, cid: 2, bsic: 5 } satisfies CellEditInput;
const plainCell = { action: "create", rat: "gsm", bandId: 1, lac: 1, cid: 2 } satisfies CellEditInput;
const dialect = new PgDialect();

function submission(ownerName?: string): SubmissionCreate {
  return {
    action: "create",
    station: { siteId: "site-1", operatorId: 1 },
    location: { regionId: NAMED_REGION_ID, latitude: 52, longitude: 21, structure: ownerName === undefined ? undefined : { ownerName } },
  };
}

function enqueueNewPlacement(features: CountryFeatures, withBand = false, filedRegionId = NAMED_REGION_ID) {
  dbMock.enqueueFor("select", "operators", [{ id: 1 }]);
  dbMock.enqueueFor("select", "regions", [{ id: NAMED_REGION_ID }]);
  if (withBand) dbMock.enqueueFor("select", "bands", [{ id: 1 }]);
  dbMock.enqueueFor("execute", undefined, [{ regionId: filedRegionId }]);
  dbMock.enqueueCountryFeatures("countries", [{ ...features }]);
}

function enqueueOwner(existing?: { id: number }) {
  dbMock.enqueueFor("select", "regions", [{ countryCode: "DE" }]);
  dbMock.enqueueFor("select", "structure_owners", existing === undefined ? [] : [existing]);
}

function enqueuePlacementCountry(regionCountry: string, operatorCountry = regionCountry) {
  dbMock.enqueueFor("select", "regions", [{ countryCode: regionCountry }]);
  dbMock.enqueueFor("select", "operators", [{ countryCode: operatorCountry }]);
}

function lookupParams(operation: string, table?: string): unknown[][] {
  const lookups = dbMock.calls.filter((call) => call.operation === operation && call.table === table);
  return lookups.map((call) => dialect.sqlToQuery((call.clauses.where ?? call.clauses.statement)?.[0] as SQL).params);
}

function coordinateLookups(): unknown[][] {
  return lookupParams("execute");
}

function featureLookups(): unknown[][] {
  return lookupParams("select", "countries");
}

function regionLookups(): unknown[][] {
  return lookupParams("select", "regions");
}

describe("toSingleSubmission", () => {
  it("accepts a new owner name in the destination country", async () => {
    enqueueNewPlacement(ownerCountry);
    enqueueOwner();

    const translated = await toSingleSubmission(submission("New owner"));

    expect(translated.location).toMatchObject({ region_id: 2, structure_owner_id: null, structure_owner_name: "New owner" });
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("allows selecting an existing owner while new proposals are disabled", async () => {
    enqueueNewPlacement(closedCountry);
    enqueueOwner({ id: 7 });

    const translated = await toSingleSubmission(submission("Existing owner"));

    expect(translated.location).toMatchObject({ structure_owner_id: 7 });
    expect(translated.location?.structure_owner_name).toBeUndefined();
  });

  it("rejects PSC in its disabled country independently of BSIC", async () => {
    enqueueNewPlacement(closedCountry, true);

    await expect(toSingleSubmission({ ...submission(), cells: [pscCell] })).rejects.toThrow("psc is not kept in this country");
  });

  it.each([
    { title: "PSC", cells: [pscCell], ownerName: undefined, message: "psc is not kept in this country" },
    { title: "BSIC", cells: [bsicCell], ownerName: undefined, message: "bsic is not kept in this country" },
    { title: "a new owner name", cells: undefined, ownerName: "New owner", message: "Structure owner proposals are disabled" },
  ])("refuses $title by the country the coordinates fall in, not by the region the request names", async ({ cells, ownerName, message }) => {
    enqueueNewPlacement(countryKeepingNothing, cells !== undefined, FILED_REGION_ID);
    if (ownerName !== undefined) enqueueOwner();

    await expect(toSingleSubmission({ ...submission(ownerName), cells })).rejects.toThrow(message);
    expect(coordinateLookups()).toEqual([[0, 21, 52, NAMED_REGION_ID]]);
    expect(featureLookups()).toEqual([[FILED_REGION_ID, 1]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("accepts PSC when the coordinates fall in a country that keeps it, whatever region the request names", async () => {
    enqueueNewPlacement(ownerCountry, true, FILED_REGION_ID);
    enqueuePlacementCountry("PL");

    expect((await toSingleSubmission({ ...submission(), cells: [pscCell] })).cells?.[0]?.details).toMatchObject({ psc: 73 });
    expect(featureLookups()).toEqual([[FILED_REGION_ID, 1]]);
  });

  it("reads the band plan's country from where the coordinates fall, not from the region the request names", async () => {
    enqueueNewPlacement(ownerCountry, true, FILED_REGION_ID);
    enqueuePlacementCountry("PL", "DE");

    const translated = await toSingleSubmission({ ...submission(), cells: [plainCell] });

    expect(translated.placement_country_code).toBe("PL");
    expect(translated.location).toMatchObject({ region_id: NAMED_REGION_ID });
    expect(regionLookups()).toEqual([[NAMED_REGION_ID], [FILED_REGION_ID]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("decides the place once for the switches, the address and the band plan", async () => {
    enqueueNewPlacement(ownerCountry, true, FILED_REGION_ID);
    enqueuePlacementCountry("DE");

    const body = submission();
    const translated = await toSingleSubmission({ ...body, location: { ...body.location!, address: "teren własny" }, cells: [plainCell] });

    expect(translated.placement_country_code).toBe("DE");
    expect(coordinateLookups()).toEqual([[0, 21, 52, NAMED_REGION_ID]]);
    expect(regionLookups()).toEqual([[NAMED_REGION_ID], [FILED_REGION_ID]]);
    expect(dbMock.calls.filter((call) => call.table === "operators")).toHaveLength(2);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("asks for no second region when the request sends coordinates only", async () => {
    dbMock.enqueueFor("select", "operators", [{ id: 1 }]);
    dbMock.enqueueFor("select", "bands", [{ id: 1 }]);
    dbMock.enqueueFor("execute", undefined, [{ regionId: FILED_REGION_ID }]);
    enqueuePlacementCountry("PL");

    const translated = await toSingleSubmission({ ...submission(), location: { latitude: 52, longitude: 21 }, cells: [plainCell] });

    expect(translated.location).toMatchObject({ region_id: FILED_REGION_ID });
    expect(translated.placement_country_code).toBe("PL");
    expect(coordinateLookups()).toEqual([[0, 21, 52, null]]);
    expect(featureLookups()).toEqual([[FILED_REGION_ID, 1]]);
    expect(regionLookups()).toEqual([[FILED_REGION_ID]]);
    expect(dbMock.pendingResults()).toBe(0);
  });
});

describe("toSubmissionUpdateInput", () => {
  it("uses the pending station placement when a partial update omits its country fields", async () => {
    dbMock.enqueueSubmissionPlacement([{ regionId: 2, operatorId: 1 }]);
    dbMock.enqueueCountryFeatures("countries", [{ ...ownerCountry }]);
    enqueueOwner();

    const translated = await toSubmissionUpdateInput(null, { location: { structure: { ownerName: "New owner" } } }, { submissionId });

    expect(translated.location).toMatchObject({ region_id: 2, structure_owner_name: "New owner" });
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("goes by the country an edit's coordinates fall in, not by the region it names", async () => {
    dbMock.enqueueSubmissionPlacement([{ regionId: 7, operatorId: 1 }]);
    dbMock.enqueueFor("select", "regions", [{ id: NAMED_REGION_ID }]);
    dbMock.enqueueFor("select", "bands", [{ id: 1 }]);
    dbMock.enqueueFor("execute", undefined, [{ regionId: FILED_REGION_ID }]);
    dbMock.enqueueCountryFeatures("countries", [{ ...ownerCountry, psc: false }]);

    const location = { regionId: NAMED_REGION_ID, latitude: 52, longitude: 21 };
    await expect(toSubmissionUpdateInput(null, { location, cells: [pscCell] }, { submissionId })).rejects.toThrow("psc is not kept in this country");
    expect(coordinateLookups()).toEqual([[0, 21, 52, NAMED_REGION_ID]]);
    expect(featureLookups()).toEqual([[FILED_REGION_ID, 1]]);
  });

  it("reads an edit's band plan country from where its coordinates fall and hands it on", async () => {
    dbMock.enqueueSubmissionPlacement([{ regionId: 7, operatorId: 1 }]);
    dbMock.enqueueFor("select", "regions", [{ id: NAMED_REGION_ID }]);
    dbMock.enqueueFor("select", "bands", [{ id: 1 }]);
    dbMock.enqueueFor("execute", undefined, [{ regionId: FILED_REGION_ID }]);
    enqueuePlacementCountry("PL", "DE");

    const location = { regionId: NAMED_REGION_ID, latitude: 52, longitude: 21 };
    const translated = await toSubmissionUpdateInput(null, { location, cells: [plainCell] }, { submissionId });

    expect(translated.placement_country_code).toBe("PL");
    expect(regionLookups()).toEqual([[NAMED_REGION_ID], [FILED_REGION_ID]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("keeps the region the submission already proposes when a cell edit sends no location", async () => {
    dbMock.enqueueSubmissionPlacement([{ regionId: 7, operatorId: 1 }]);
    dbMock.enqueueFor("select", "bands", [{ id: 1 }]);
    enqueuePlacementCountry("PL");

    const translated = await toSubmissionUpdateInput(null, { cells: [plainCell] }, { submissionId });

    expect(translated.placement_country_code).toBe("PL");
    expect(coordinateLookups()).toEqual([]);
    expect(featureLookups()).toEqual([[7, 1]]);
    expect(regionLookups()).toEqual([[7]]);
    expect(dbMock.pendingResults()).toBe(0);
  });
});

describe("toDirectChange", () => {
  it("goes by the country a station stays in when the request names a region elsewhere", async () => {
    dbMock.enqueueFor("select", "regions", [{ id: NAMED_REGION_ID }]);
    dbMock.enqueueFor("select", "bands", [{ id: 1 }]);
    dbMock.enqueueFor("select", "stations", [{ stationId: STATION_ID, region_id: FILED_REGION_ID, latitude: 52, longitude: 21 }]);
    dbMock.enqueueFor("execute", undefined, [{ regionId: FILED_REGION_ID }]);
    dbMock.enqueueCountryFeatures("countries", [{ ...countryKeepingNothing }]);

    const edit = { action: "update" as const, stationId: STATION_ID, location: { regionId: NAMED_REGION_ID }, cells: [pscCell] };
    await expect(toDirectChange(edit)).rejects.toThrow("psc is not kept in this country");
    expect(coordinateLookups()).toEqual([[0, 21, 52, NAMED_REGION_ID]]);
    expect(featureLookups()).toEqual([[FILED_REGION_ID, STATION_ID, STATION_ID]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("reads the band plan's country from where a station stays when the request names a region elsewhere", async () => {
    dbMock.enqueueFor("select", "regions", [{ id: NAMED_REGION_ID }], [{ countryCode: "PL" }]);
    dbMock.enqueueFor("select", "bands", [{ id: 1 }]);
    dbMock.enqueueFor(
      "select",
      "stations",
      [{ stationId: STATION_ID, region_id: FILED_REGION_ID, latitude: 52, longitude: 21 }],
      [{ locationCountry: "PL", operatorCountry: "PL" }],
    );
    dbMock.enqueueFor("execute", undefined, [{ regionId: FILED_REGION_ID }]);

    const edit = { action: "update" as const, stationId: STATION_ID, location: { regionId: NAMED_REGION_ID }, cells: [plainCell] };
    const change = await toDirectChange(edit);

    expect(change.placement_country_code).toBe("PL");
    expect(change.location).toMatchObject({ region_id: NAMED_REGION_ID });
    expect(regionLookups()).toEqual([[NAMED_REGION_ID], [FILED_REGION_ID]]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("reads the band plan's country from the operator when the edit takes the station off its location", async () => {
    dbMock.enqueueFor("select", "bands", [{ id: 1 }]);
    dbMock.enqueueFor("select", "stations", [{ locationCountry: "PL", operatorCountry: "DE" }]);

    const change = await toDirectChange({ action: "update", stationId: STATION_ID, location: null, cells: [plainCell] });

    expect(change.placement_country_code).toBe("DE");
    expect(change.location).toBeNull();
    expect(dbMock.pendingResults()).toBe(0);
  });
});
