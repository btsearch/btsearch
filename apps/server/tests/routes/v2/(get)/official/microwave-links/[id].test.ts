import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(get)/official/microwave-links/[id].js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { linkRow, scriptEquipment, servedLink } from "../../../../../helpers/microwaveLinkFixtures.js";
import { expectError, injectMutation, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import { scriptGuestVisibility } from "../../../../../helpers/officialDataFixtures.js";
import { licenseeRow } from "../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/official/microwave-links/36" };

function asGuest() {
  scriptGuestVisibility([1]);
  return { runAuth: true };
}

describe("GET /official/microwave-links/:id", () => {
  it("returns a link of a visible source with its licensee", async () => {
    dbMock.enqueueFor("select", "official.microwave_links", [{ link: linkRow, sourceKey: "test-register", datasetKind: "permit" }]);
    scriptEquipment();
    dbMock.enqueueFor("select", "official.licensees", [{ licensee: licenseeRow, sourceKey: "test-register" }]);
    const response = await injectMutation(route, { ...request, url: `${request.url}?include=licensee` }, asGuest());
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      data: {
        ...servedLink,
        licensee: { id: 5, sourceKey: "test-register", name: "Example Mobile", legalName: "Example Mobile S.A.", operatorId: null, brandId: null },
      },
    });
    expect(whereQuery("official.microwave_links", "select")).toEqual({
      sql: '(("official"."microwave_links"."id" = $1) and ("official"."sources"."id" in ($2)))',
      params: [36, 1],
    });
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("returns 404 when the link is missing or its source is hidden from you", async () => {
    dbMock.enqueueFor("select", "official.microwave_links", []);
    expectError(await injectMutation(route, request, asGuest()), 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.table === "official.microwave_link_antenna_types")).toBe(false);
  });

  it.each(["/official/microwave-links/0", "/official/microwave-links/36?include=sectors"])("rejects %s", async (url) => {
    expectError(await injectMutation(route, { ...request, url }, { runAuth: true }), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });
});
