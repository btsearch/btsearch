import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(delete)/spectrum-holdings/[id].js";
import { scriptMaintainer } from "../../../../helpers/auditFixtures.js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const request = { method: "DELETE" as const, url: "/spectrum-holdings/5" };
const adminOptions = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };
const editorOptions = { session: userSession("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "editor") };
const row = {
  id: 5,
  operatorId: 1,
  bandId: 7,
  regionId: null,
  downlinkLowKhz: 3400000,
  downlinkHighKhz: 3500000,
  uplinkLowKhz: null,
  uplinkHighKhz: null,
  validFrom: null,
  validTo: null,
  source: null,
  createdAt: new Date("2026-10-21T00:00:00Z"),
  updatedAt: new Date("2026-10-21T00:00:00Z"),
};

describe("DELETE /spectrum-holdings/5", () => {
  it("refuses a maintainer of another country", async () => {
    dbMock.query.spectrumHoldings.findFirst.mockResolvedValue(row);
    scriptMaintainer();
    dbMock.enqueueFor("select", "operators", [{ countryCode: "DE" }]);

    expectError(await injectMutation(route, request, editorOptions), 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("deletes and audits the holding", async () => {
    dbMock.query.spectrumHoldings.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }]);
    scriptAudit();
    dbMock.enqueueFor("delete", "spectrum_holdings", []);

    const response = await injectMutation(route, request, adminOptions);
    expect(response.statusCode).toBe(204);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
  });
});
