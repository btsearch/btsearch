import { describe, expect, it } from "vitest";

import patchBand from "../../../../src/routes/v1/(patch)/bands/[id].js";
import postBand from "../../../../src/routes/v1/(post)/bands/index.js";
import { dbMock, userSession } from "../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../helpers/mutationAssertions.js";

const row = { id: 7, rat: "LTE", code: "B3", name: "LTE 1800", value: 1800, duplex: "FDD", variant: "commercial" };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("POST /bands", () => {
  it.each([
    { rat: "CDMA", name: "CDMA 420", value: 420 },
    { rat: "IOT", name: "IOT 800", value: 800 },
    { rat: "LTE", name: "LTE 1800", value: 1800 },
    { rat: "NR", name: "NR", value: null, duplex: null },
  ])("rejects a permit label before starting a transaction: %j", async (payload) => {
    const response = await injectMutation(postBand, { method: "POST", url: "/bands", payload }, options);

    expectError(response, 400, "BAD_REQUEST");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("creates a real band and adds it to the legacy country plan", async () => {
    scriptAudit();
    dbMock.enqueueFor("insert", "bands", [row]);
    dbMock.enqueueFor("insert", "country_bands", [{ countryCode: "PL", bandId: row.id }]);
    const { id: _id, ...payload } = row;
    const response = await injectMutation(postBand, { method: "POST", url: "/bands", payload }, options);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: row });
  });
});

describe("PATCH /bands/:id", () => {
  it.each([{ duplex: null }, { value: null, duplex: null }])("rejects a change that turns a real band into a label: %j", async (payload) => {
    dbMock.query.bands.findFirst.mockResolvedValue(row);
    const response = await injectMutation(patchBand, { method: "PATCH", url: "/bands/7", payload }, options);

    expectError(response, 400, "BAD_REQUEST");
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("accepts a partial update without requiring the unchanged duplex again", async () => {
    scriptAudit();
    dbMock.query.bands.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("update", "bands", [{ ...row, name: "1800" }]);
    const response = await injectMutation(patchBand, { method: "PATCH", url: "/bands/7", payload: { name: "1800" } }, options);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { ...row, name: "1800" } });
  });
});
