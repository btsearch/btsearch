import { describe, expect, it } from "vitest";

import route from "../../../../../../../src/routes/v2/(put)/countries/[code]/bands/[bandId].js";
import { dbMock, userSession } from "../../../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../../../helpers/mutationAssertions.js";

const row = { id: 7, rat: "LTE", code: "B3", name: "LTE 1800", value: 1800, duplex: "FDD", variant: "commercial" };
const request = { method: "PUT" as const, url: "/countries/PL/bands/7" };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("PUT /countries/PL/bands/7", () => {
  it("applies the documented catalog or band-plan mutation", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "bands", [row]);
    dbMock.enqueueFor("select", "country_bands", []);
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("insert", "country_bands", [{ countryCode: "PL", bandId: 7 }]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { countryCode: "PL", bandId: 7 } });
  });

  it("hides the internal unknown band from band-plan management", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "bands", [{ ...row, value: 0 }]);
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "country_bands")).toBe(false);
  });

  it("returns an existing band-plan entry without inserting another", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "countries", [{ code: "PL" }]);
    dbMock.enqueueFor("select", "bands", [row]);
    dbMock.enqueueFor("select", "country_bands", [{ countryCode: "PL", bandId: 7 }]);
    dbMock.enqueueFor("delete", "audit_operations", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "country_bands")).toBe(false);
  });
});
