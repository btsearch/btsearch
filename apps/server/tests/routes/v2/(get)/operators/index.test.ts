import { describe, expect, it } from "vitest";

import getOperator from "../../../../../src/routes/v2/(get)/operators/[id].js";
import getOperators from "../../../../../src/routes/v2/(get)/operators/index.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import { createRouteHarness } from "../../../../helpers/routeHarness.js";

const operator = {
  id: 1,
  countryCode: "PL",
  brandId: null,
  name: "Example",
  full_name: "Example SA",
  shortCode: null,
  sortPriority: null,
  mnc: 26001,
};

describe("getOperators", () => {
  it("preserves a leading zero in the legacy MNC and maps shared-network links", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    dbMock.enqueueFor("select", "operators", [operator]);
    dbMock.enqueueFor("select", "plmns", [{ operatorId: 1, mcc: "260", mnc: "02", code: "26002", role: "secondary" }]);
    dbMock.enqueueFor("select", "operator_links", [{ operatorId: 1, kind: "jv_member", relatedOperatorId: 2 }]);
    const app = await createRouteHarness(getOperators);
    const response = await app.inject({ method: "GET", url: "/operators?countryCodes=PL" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [
        {
          id: 1,
          countryCode: "PL",
          brandId: null,
          name: "Example",
          legalName: "Example SA",
          shortCode: null,
          sortPriority: null,
          primaryPlmn: "26001",
          plmns: [
            { mcc: "260", mnc: "01", plmn: "26001", role: "primary" },
            { mcc: "260", mnc: "02", plmn: "26002", role: "secondary" },
          ],
          links: [{ kind: "jvMember", operatorId: 2 }],
        },
      ],
    });
  });

  it("does not load operators from unavailable countries", async () => {
    dbMock.enqueueFor("select", "countries", []);
    const app = await createRouteHarness(getOperators);
    const response = await app.inject({ method: "GET", url: "/operators?countryCodes=US" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [] });
    expect(dbMock.calls).toHaveLength(1);
  });

  it("returns an empty collection without looking up details when no operators match", async () => {
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    dbMock.enqueueFor("select", "operators", []);
    const app = await createRouteHarness(getOperators);
    expect((await app.inject({ method: "GET", url: "/operators" })).json()).toEqual({ data: [] });
    expect(dbMock.calls.map((call) => call.table)).toEqual(["countries", "operators"]);
  });
});

describe("getOperator", () => {
  it("prefers an explicit primary PLMN over the legacy number", async () => {
    dbMock.enqueueFor("select", "operators", [operator]);
    dbMock.enqueueFor("select", "plmns", [{ operatorId: 1, mcc: "310", mnc: "260", code: "310260", role: "primary" }]);
    dbMock.enqueueFor("select", "operator_links", []);
    dbMock.enqueueFor("select", "countries", [{ code: "PL", isVisible: true }]);
    const app = await createRouteHarness(getOperator);
    const response = await app.inject({ method: "GET", url: "/operators/1" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ primaryPlmn: "310260", plmns: [{ mcc: "310", mnc: "260", plmn: "310260", role: "primary" }] });
  });

  it.each([true, false])("returns 404 when the operator is missing or its country is unavailable (%s)", async (exists) => {
    dbMock.enqueueFor("select", "operators", exists ? [operator] : []);
    dbMock.enqueueFor("select", "plmns", []);
    dbMock.enqueueFor("select", "operator_links", []);
    if (exists) dbMock.enqueueFor("select", "countries", []);
    const app = await createRouteHarness(getOperator);
    const response = await app.inject({ method: "GET", url: "/operators/1" });
    expect(response.statusCode).toBe(404);
    expect(response.json().errors[0].code).toBe("NOT_FOUND");
  });
});
