import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(patch)/spectrum-holdings/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };
const row = {
  id: 5,
  operatorId: 1,
  bandId: 7,
  regionId: null,
  downlinkLowKhz: 1805000,
  downlinkHighKhz: 1835000,
  uplinkLowKhz: 1710000,
  uplinkHighKhz: 1740000,
  validFrom: null,
  validTo: "2037-12-31",
  source: "UKE",
  createdAt: new Date("2026-10-21T00:00:00Z"),
  updatedAt: new Date("2026-10-21T00:00:00Z"),
};

function patch(payload: object) {
  return { method: "PATCH" as const, url: "/spectrum-holdings/5", payload };
}

describe("PATCH /spectrum-holdings/5", () => {
  it("checks the merged holding again and audits the change", async () => {
    dbMock.query.spectrumHoldings.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }]);
    scriptAudit();
    dbMock.enqueueFor("select", "bands", [{ code: "B3", planBandId: 7 }]);
    dbMock.enqueueFor("select", "spectrum_holdings", []);
    dbMock.enqueueFor("update", "spectrum_holdings", [{ ...row, downlinkHighKhz: 1830000, uplinkHighKhz: 1735000 }]);

    const response = await injectMutation(route, patch({ downlinkKhz: [1805000, 1830000], uplinkKhz: [1710000, 1735000] }), options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { downlinkKhz: [1805000, 1830000], uplinkKhz: [1710000, 1735000] } });
    const update = dbMock.calls.find((call) => call.operation === "update" && call.table === "spectrum_holdings");
    expect(update?.values).toMatchObject({ downlinkLowKhz: 1805000, downlinkHighKhz: 1830000, operatorId: undefined, source: undefined });
  });

  it("refuses moving the holding to an operator of another country", async () => {
    dbMock.query.spectrumHoldings.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }], [{ countryCode: "DE" }]);

    expectError(await injectMutation(route, patch({ operatorId: 9 }), options), 400, "BAD_REQUEST", "The operator belongs to another country");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("refuses a start date after the stored end date", async () => {
    dbMock.query.spectrumHoldings.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "operators", [{ countryCode: "PL" }]);

    expectError(await injectMutation(route, patch({ validFrom: "2038-01-01" }), options), 400, "BAD_REQUEST", "validFrom must not be after validTo");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });
});
