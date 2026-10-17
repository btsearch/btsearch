import { describe, expect, it } from "vitest";

import { findDocumentationGap } from "../../../../../../src/features/openapi/document.js";
import route from "../../../../../../src/routes/v2/(get)/stations/[id]/siblings.js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { expectError } from "../../../../../helpers/mutationAssertions.js";
import { operatorRow, primaryPlmn } from "../../../../../helpers/operatorFixtures.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";
import { stationRow, visibleStation } from "../../../../../helpers/stationFixtures.js";

const sharedNetworkId = 5;
const station = stationRow({ id: 12, operator_id: 8, location_id: 2 });

function scriptSiblingLookup(siblingIds: number[], sameEnbSiblingIds: number[]) {
  dbMock.enqueueFor(
    "select",
    "stations",
    siblingIds.map((id) => ({ id })),
  );
  if (siblingIds.length === 0) return;

  dbMock.enqueueFor("select", "stations", [{ locationCountry: "PL", operatorCountry: "PL" }]);
  dbMock.enqueueFor("select", "lte_cells", [{ enbid: 412345 }]);
  dbMock.enqueueFor("select", "operators", [operatorRow(8, 26002)], [operatorRow(sharedNetworkId, 26034)]);
  dbMock.enqueueFor("select", "plmns", [primaryPlmn(8, "26002")], [primaryPlmn(sharedNetworkId, "26034")]);
  dbMock.enqueueFor("select", "operator_links", [{ operatorId: 8, kind: "jv_member", relatedOperatorId: sharedNetworkId }]);
  dbMock.enqueueFor(
    "select",
    "lte_cells",
    sameEnbSiblingIds.map((stationId) => ({ stationId })),
  );
}

describe("GET /stations/:id/siblings", () => {
  it("returns the same-eNBID siblings as stations with the requested relations, in the lookup's order", async () => {
    const published = stationRow({ id: 15, station_id: "B15", operator_id: 9, location_id: 2 });
    const awaitingCells = stationRow({ id: 13, station_id: "B13", operator_id: 9, location_id: 2, status: "pending" });
    visibleStation(station);
    scriptSiblingLookup([15, 13, 14], [13, 15]);
    dbMock.enqueueFor("select", "stations", [awaitingCells, published], []);
    dbMock.enqueueFor("select", "extra_identificators", [{ id: 1, station_id: 15, networks_id: 4321, networks_name: "NET_B15", mno_name: null }]);
    dbMock.enqueueFor("select", "station_sectors", [
      { id: 5, station_id: 15, azimuth: 120 },
      { id: 6, station_id: 13, azimuth: 360 },
    ]);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "GET", url: "/stations/12/siblings?include=sectors" });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject([
      {
        id: 15,
        siteId: "B15",
        operatorId: 9,
        locationId: 2,
        status: "active",
        identifiers: [
          { kind: "networksId", value: "4321" },
          { kind: "networksName", value: "NET_B15" },
        ],
        sectors: [{ id: 5, azimuth: 120 }],
      },
      { id: 13, siteId: "B13", status: "awaitingCells", identifiers: [], sectors: [{ id: 6, azimuth: null }] },
    ]);
    expect(response.json().data[0]).not.toHaveProperty("cells");
  });

  it("returns an empty list without loading stations when there is no sibling", async () => {
    visibleStation(station);
    scriptSiblingLookup([], []);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "GET", url: "/stations/12/siblings" });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ data: [] });
    expect(dbMock.calls.map((call) => call.table)).toEqual(["stations", "countries", "stations"]);
  });

  it("returns an empty list when no sibling has the station's eNBID", async () => {
    visibleStation(station);
    scriptSiblingLookup([13], []);
    const app = await createRouteHarness(route);
    const response = await app.inject({ method: "GET", url: "/stations/12/siblings" });

    expect(response.json()).toEqual({ data: [] });
    expect(dbMock.calls.some((call) => call.table === "extra_identificators")).toBe(false);
  });

  it.each(["missing", "hidden"])("hides a %s station before looking for siblings", async (kind) => {
    dbMock.enqueueFor("select", "stations", kind === "missing" ? [] : [{ station, countryCode: "PL" }]);
    if (kind === "hidden") dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    const app = await createRouteHarness(route);

    expectError(await app.inject({ method: "GET", url: "/stations/12/siblings" }), 404, "NOT_FOUND");
    expect(dbMock.calls.filter((call) => call.table === "stations")).toHaveLength(1);
  });

  it.each(["/stations/0/siblings", "/stations/no-station/siblings", "/stations/12/siblings?include=siblings", "/stations/12/siblings?limit=1"])(
    "rejects %s before database access",
    async (url) => {
      const app = await createRouteHarness(route);

      expectError(await app.inject({ method: "GET", url }), 400, "VALIDATION_ERROR");
      expect(dbMock.calls).toEqual([]);
    },
  );

  it("can be described by the API document", () => {
    expect(findDocumentationGap(route as unknown as Parameters<typeof findDocumentationGap>[0])).toBeUndefined();
  });
});
