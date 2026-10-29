import { describe, expect, it } from "vitest";

import patchStation from "../../../../src/routes/v1/(patch)/stations/[id].js";
import { dbMock, queryOf, userSession } from "../../../helpers/boundaries.js";
import { injectMutation, scriptAudit } from "../../../helpers/mutationAssertions.js";
import { stationRow } from "../../../helpers/stationFixtures.js";

const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };
const inactive = stationRow({ id: 4, operator_id: 7, status: "inactive", location: null, sectors: [] });
const storedCell = {
  id: 11,
  rat: "LTE",
  gsm: null,
  umts: null,
  lte: { enbid: 12345, clid: 1 },
  nr: null,
  plmns: [],
  station: { operator_id: 7, status: "published", operator: { id: 7, plmns: [{ code: "26002" }] } },
};

function scriptStationWrite(saved: typeof inactive): void {
  dbMock.query.stations.findFirst.mockResolvedValue(inactive);
  scriptAudit();
  dbMock.enqueueFor("update", "stations", [saved]);
}

describe("PATCH /stations/:station_id", () => {
  it("refuses to reactivate a station whose cell identity an active station took meanwhile", async () => {
    scriptStationWrite({ ...inactive, status: "published" });
    dbMock.query.cells.findMany.mockResolvedValueOnce([storedCell]);
    dbMock.enqueueFor("execute", undefined, []);
    dbMock.enqueueFor("select", "lte_cells", [{ enbid: 12345, clid: 1 }]);

    const response = await injectMutation(patchStation, { method: "PATCH", url: "/stations/4", payload: { status: "published" } }, options);

    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().errors[0]).toMatchObject({
      code: "DUPLICATE_ENTRY",
      message: "An LTE cell with eNBID 12345 and CLID 1 already exists on one of the cell's networks",
    });
    expect(dbMock.query.cells.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { OR: [{ id: { in: [] } }, { station_id: 4 }] } });
    const lock = dbMock.calls.find((call) => call.operation === "execute");
    expect(queryOf(lock?.clauses.statement?.[0]).params).toEqual([1, "LTE:12345:1"]);
  });

  it("checks the station's cells under a new owner", async () => {
    scriptStationWrite({ ...inactive, operator_id: 8 });
    dbMock.query.cells.findMany.mockResolvedValueOnce([]);

    await injectMutation(patchStation, { method: "PATCH", url: "/stations/4", payload: { operator_id: 8 } }, options);

    expect(dbMock.query.cells.findMany).toHaveBeenCalledTimes(1);
  });

  it("checks no identity for a change that keeps the owner and the status", async () => {
    scriptStationWrite({ ...inactive, notes: "Roof" });

    const response = await injectMutation(patchStation, { method: "PATCH", url: "/stations/4", payload: { notes: "Roof" } }, options);

    expect(response.statusCode, response.body).toBe(200);
    expect(dbMock.query.cells.findMany).not.toHaveBeenCalled();
  });

  it("keeps the stored host station out of its answer and its body", async () => {
    scriptStationWrite({ ...inactive, notes: "Roof", ran_host_station_id: 2 });

    const response = await injectMutation(patchStation, { method: "PATCH", url: "/stations/4", payload: { notes: "Roof" } }, options);
    const hostWrite = await injectMutation(patchStation, { method: "PATCH", url: "/stations/4", payload: { ran_host_station_id: 2 } }, options);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).not.toHaveProperty("ran_host_station_id");
    expect(hostWrite.statusCode).toBe(400);
    expect(hostWrite.json().errors[0].details).toEqual([{ field: "unknown", validationMessage: 'Unrecognized key: "ran_host_station_id"' }]);
  });
});
