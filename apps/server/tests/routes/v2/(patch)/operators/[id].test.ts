import { describe, expect, it } from "vitest";

import route from "../../../../../src/routes/v2/(patch)/operators/[id].js";
import { dbMock, userSession } from "../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../helpers/mutationAssertions.js";

const row = {
  id: 7,
  countryCode: "PL",
  brandId: null,
  name: "Network",
  full_name: "Network Company",
  shortCode: null,
  sortPriority: null,
  mnc: null,
};
const request = { method: "PATCH" as const, url: "/operators/7", payload: { name: "Network" } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("PATCH /operators", () => {
  it("replaces PLMNs, preserves the two- and three-digit MNC strings and updates the legacy primary", async () => {
    dbMock.query.operators.findFirst.mockResolvedValue(row);
    scriptAudit();
    dbMock.enqueueFor("select", "operators", []);
    dbMock.enqueueFor(
      "select",
      "plmns",
      [],
      [],
      [
        { operatorId: 7, mcc: "260", mnc: "01", code: "26001", role: "primary" },
        { operatorId: 7, mcc: "310", mnc: "260", code: "310260", role: "secondary" },
      ],
    );
    dbMock.enqueueFor("select", "operator_links", [], []);
    dbMock.enqueueFor("update", "operators", [{ ...row, mnc: 26001 }]);
    dbMock.enqueueFor("delete", "plmns", []);
    dbMock.enqueueFor("update", "plmns", []);
    dbMock.enqueueFor("insert", "plmns", []);
    const entries = [
      { plmn: "26001", role: "primary" },
      { plmn: "310260", role: "secondary" },
    ];
    const response = await injectMutation(route, { ...request, payload: { plmns: entries } }, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        primaryPlmn: "26001",
        plmns: [
          { mcc: "260", mnc: "01", plmn: "26001", role: "primary" },
          { mcc: "310", mnc: "260", plmn: "310260", role: "secondary" },
        ],
      },
    });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "plmns")?.values).toEqual([
      { operatorId: 7, mcc: "260", mnc: "01", role: "primary" },
      { operatorId: 7, mcc: "310", mnc: "260", role: "secondary" },
    ]);
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "operators")?.values).toMatchObject({ mnc: 26001 });
  });

  it("clears all PLMNs and the legacy primary when an empty replacement is sent", async () => {
    dbMock.query.operators.findFirst.mockResolvedValue({ ...row, mnc: 26001 });
    scriptAudit();
    dbMock.enqueueFor("select", "plmns", [], []);
    dbMock.enqueueFor("select", "operator_links", [], []);
    dbMock.enqueueFor("update", "operators", [row]);
    dbMock.enqueueFor("delete", "plmns", []);
    dbMock.enqueueFor("update", "plmns", []);
    const response = await injectMutation(route, { ...request, payload: { plmns: [] } }, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { primaryPlmn: null, plmns: [] } });
    expect(dbMock.calls.find((call) => call.operation === "update" && call.table === "operators")?.values).toMatchObject({ mnc: null });
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "plmns")).toBe(false);
  });

  it("adds shared-network membership on the member while preserving omitted PLMNs and identity fields", async () => {
    dbMock.query.operators.findFirst.mockResolvedValue(row);
    scriptAudit();
    dbMock.enqueueFor("select", "operators", [{ id: 8, countryCode: "PL" }]);
    dbMock.enqueueFor("select", "plmns", [], []);
    dbMock.enqueueFor("select", "operator_links", [], [], [{ operatorId: 7, kind: "jv_member", relatedOperatorId: 8 }]);
    dbMock.enqueueFor("delete", "operator_links", []);
    dbMock.enqueueFor("insert", "operator_links", []);
    const response = await injectMutation(route, { ...request, payload: { links: [{ kind: "jvMember", operatorId: 8 }] } }, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { name: "Network", primaryPlmn: null, links: [{ kind: "jvMember", operatorId: 8 }] } });
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "operator_links")?.values).toEqual([
      { operatorId: 7, relatedOperatorId: 8, kind: "jv_member" },
    ]);
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "operators")).toBe(false);
  });

  it.each(["plmns", "operators"])("rejects a PLMN already reserved by another operator in %s", async (conflictTable) => {
    dbMock.query.operators.findFirst.mockResolvedValue(row);
    scriptAudit();
    dbMock.enqueueFor("select", "plmns", conflictTable === "plmns" ? [{ id: 1 }] : []);
    dbMock.enqueueFor("select", "operators", conflictTable === "operators" ? [{ id: 8 }] : []);
    expectError(
      await injectMutation(route, { ...request, payload: { plmns: [{ plmn: "26001", role: "primary" }] } }, options),
      409,
      "CONFLICT",
      "One of these PLMNs already belongs to another operator",
    );
    expect(dbMock.calls.some((call) => call.operation === "delete")).toBe(false);
  });

  it("rejects linking an operator to itself", async () => {
    dbMock.query.operators.findFirst.mockResolvedValue(row);
    scriptAudit();
    expectError(
      await injectMutation(route, { ...request, payload: { links: [{ kind: "jvMember", operatorId: 7 }] } }, options),
      400,
      "BAD_REQUEST",
      "An operator cannot be linked to itself",
    );
  });

  it.each([
    { related: [], message: "A linked operator was not found" },
    { related: [{ id: 8, countryCode: "DE" }], message: "A linked operator belongs to another country" },
  ])("rejects invalid shared-network references %j", async ({ related, message }) => {
    dbMock.query.operators.findFirst.mockResolvedValue(row);
    scriptAudit();
    dbMock.enqueueFor("select", "operators", related);
    expectError(
      await injectMutation(route, { ...request, payload: { links: [{ kind: "jvMember", operatorId: 8 }] } }, options),
      400,
      "BAD_REQUEST",
      message,
    );
  });

  it("prevents reciprocal shared-network membership", async () => {
    dbMock.query.operators.findFirst.mockResolvedValue(row);
    scriptAudit();
    dbMock.enqueueFor("select", "operators", [{ id: 8, countryCode: "PL" }]);
    dbMock.enqueueFor("select", "operator_links", [{ id: 8 }]);
    expectError(
      await injectMutation(route, { ...request, payload: { links: [{ kind: "jvMember", operatorId: 8 }] } }, options),
      400,
      "BAD_REQUEST",
      "A linked operator is already a member of this operator",
    );
  });

  it("requires a referenced brand to exist", async () => {
    dbMock.query.operators.findFirst.mockResolvedValue(row);
    scriptAudit();
    dbMock.enqueueFor("select", "brands", []);
    expectError(await injectMutation(route, { ...request, payload: { brandId: 8 } }, options), 400, "BAD_REQUEST", "Brand not found");
  });

  it.each([
    {
      plmns: [
        { plmn: "26001", role: "primary" },
        { plmn: "26002", role: "primary" },
      ],
    },
    {
      plmns: [
        { plmn: "26001", role: "secondary" },
        { plmn: "26001", role: "primary" },
      ],
    },
    {
      links: [
        { kind: "jvMember", operatorId: 8 },
        { kind: "jvMember", operatorId: 8 },
      ],
    },
    { countryCode: "DE" },
  ])("rejects ambiguous or immutable operator fields %j", async (payload) => {
    expectError(await injectMutation(route, { ...request, payload }, options), 400, "VALIDATION_ERROR");
    expect(dbMock.query.operators.findFirst).not.toHaveBeenCalled();
  });

  it("applies and audits the documented operator mutation", async () => {
    scriptAudit();
    dbMock.query.operators.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "operators", []);
    dbMock.enqueueFor("select", "plmns", [], []);
    dbMock.enqueueFor("select", "operator_links", [], []);
    dbMock.enqueueFor("update", "operators", [row]);
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { id: 7, primaryPlmn: null, plmns: [], links: [] } });
    expect(dbMock.calls.some((call) => call.operation === "insert" && call.table === "audit_logs")).toBe(true);
  });

  it("returns 404 for an absent operator", async () => {
    dbMock.query.operators.findFirst.mockResolvedValue(undefined);
    const response = await injectMutation(route, request, options);
    expectError(response, 404, "NOT_FOUND");
    expect(dbMock.calls).toEqual([]);
  });

  it("rejects an operator name already used in this country", async () => {
    scriptAudit();
    dbMock.query.operators.findFirst.mockResolvedValue(row);
    dbMock.enqueueFor("select", "operators", [{ id: 8 }]);
    const response = await injectMutation(route, request, options);
    expectError(response, 409, "CONFLICT", "This country already has an operator with this name");
    expect(dbMock.calls.some((call) => call.operation === "update" && call.table === "operators")).toBe(false);
  });
});
