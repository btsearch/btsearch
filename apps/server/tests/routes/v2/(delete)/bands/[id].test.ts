import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/bands/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = { id: 7, rat: "LTE", code: "B3", name: "LTE 1800", value: 1800, duplex: "FDD", variant: "commercial" };
const request = { method: "DELETE" as const, url: "/bands/7" };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("DELETE /bands/7", () => {
  it("applies the documented catalog or band-plan mutation", async () => {
    scriptAudit();
    dbMock.query.bands.findFirst.mockResolvedValue(row);
    for (const table of ["cells", "proposed_cells"]) dbMock.enqueueFor("select", table, []);
    dbMock.enqueueFor("delete", "country_bands", []);
    dbMock.enqueueFor("delete", "bands", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  });

  it("returns 404 for a missing band", async () => {
    dbMock.query.bands.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls).toEqual([]);
  });

  it.each(["cells", "proposed_cells"])("refuses deletion while %s still use the band", async (table) => {
    scriptAudit();
    dbMock.query.bands.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "cells", table === "cells" ? [{ id: 1 }] : []);
    dbMock.enqueueFor("select", "proposed_cells", table === "proposed_cells" ? [{ id: 1 }] : []);
    const response = await injectMutation(route, request, options);
    expectError(response, 409, "CONFLICT");
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "bands")).toBe(false);
  });

  it("ignores permits and snapshots that reference a separate label with the same id", async () => {
    scriptAudit();
    dbMock.query.bands.findFirst.mockResolvedValue(row);
    for (const table of ["cells", "proposed_cells"]) dbMock.enqueueFor("select", table, []);
    for (const table of ["uke_permits", "stats_snapshots"]) dbMock.enqueueFor("select", table, [{ id: 1 }]);
    dbMock.enqueueFor("delete", "country_bands", []);
    dbMock.enqueueFor("delete", "bands", []);

    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    expect(dbMock.calls.some((call) => call.table === "uke_permits" || call.table === "stats_snapshots")).toBe(false);
  });
});
