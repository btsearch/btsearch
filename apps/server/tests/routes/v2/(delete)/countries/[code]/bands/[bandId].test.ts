import { describe, expect, it } from "vitest";

import route from "../../../../../../../src/routes/v2/(delete)/countries/[code]/bands/[bandId].js";
import { dbMock, userSession } from "../../../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../../../helpers/mutationAssertions.js";

const row = { id: 7, rat: "LTE", code: "B3", name: "LTE 1800", value: 1800, duplex: "FDD", variant: "commercial" };
const request = { method: "DELETE" as const, url: "/countries/PL/bands/7" };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("DELETE /countries/PL/bands/7", () => {
  it("returns a controlled deletion failure when the transaction rejects", async () => {
    dbMock.transaction.mockRejectedValueOnce(new Error("Database connection lost"));
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_DELETE");
  });

  it("applies the documented catalog or band-plan mutation", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "bands", [row]);
    dbMock.enqueueFor("select", "country_bands", [{ countryCode: "PL", bandId: 7 }]);
    dbMock.enqueueFor("select", "cells", []);
    dbMock.enqueueFor("delete", "country_bands", []);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");
  });

  it("removes the real band from the plan even when a permit label has the same id", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "bands", [row]);
    dbMock.enqueueFor("select", "country_bands", [{ countryCode: "PL", bandId: 7 }]);
    dbMock.enqueueFor("select", "cells", []);
    dbMock.enqueueFor("select", "uke_permits", [{ id: 1 }]);
    dbMock.enqueueFor("delete", "country_bands", []);

    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(204);
    expect(dbMock.calls.some((call) => call.table === "uke_permits")).toBe(false);
  });

  it("hides the internal unknown band from band-plan management", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "bands", [{ ...row, value: 0 }]);

    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "country_bands")).toBe(false);
  });

  it("refuses deletion while cells still use the band", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "bands", [row]);
    dbMock.enqueueFor("select", "country_bands", [{ countryCode: "PL", bandId: 7 }]);
    dbMock.enqueueFor("select", "cells", [{ id: 1 }]);

    const response = await injectMutation(route, request, options);
    expectError(response, 409, "CONFLICT");
    expect(dbMock.calls.some((call) => call.operation === "delete" && call.table === "country_bands")).toBe(false);
  });
});
