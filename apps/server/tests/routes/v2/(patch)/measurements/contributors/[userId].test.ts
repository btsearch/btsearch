import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(patch)/measurements/contributors/[userId].js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../../../helpers/mutationAssertions.js";
import { STAFF_ID, signInAs } from "../../../../../helpers/officialFixtures.js";

const contributorId = "33333333-3333-4333-8333-333333333333";
const vouchedAt = new Date("2026-10-24T12:00:00Z");
const contributor = { id: contributorId, username: "driver", name: "Driver", image: null };
const staff = { id: STAFF_ID, username: "staff", name: "Staff Member", image: null };
const vouch = { userId: contributorId, weight: 1.5, confirmsAlone: true, reason: "Known to the team", vouchedById: STAFF_ID, vouchedAt, until: null };

function update(payload: object, role: "admin" | "editor" = "admin") {
  return injectMutation(route, { method: "PATCH", url: `/measurements/contributors/${contributorId}`, payload }, signInAs(role));
}

function writes(operation: string, table: string) {
  return dbMock.calls.filter((call) => call.operation === operation && call.table === table).map((call) => call.values);
}

function scriptAnswer(vouchRow: typeof vouch | null, block: object | null = null) {
  dbMock.enqueueFor("select", "contributors", [
    { user: contributor, vouch: vouchRow, vouchedBy: vouchRow === null ? null : staff, block, blockedBy: block === null ? null : staff },
  ]);
  dbMock.enqueueFor("select", "terms_acceptances", [{ userId: contributorId, version: 1, acceptedAt: vouchedAt }]);
  dbMock.enqueueFor("select", "uploads", []);
  dbMock.enqueueFor("select", "devices", [], [{ userId: contributorId, computed: 0.1, effective: vouchRow?.weight ?? 0.1, samples: 0 }]);
  dbMock.enqueueFor("select", "device_scores", []);
}

describe("PATCH /measurements/contributors/:userId", () => {
  it("vouches for a person, audits it and folds their retained uploads again", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "contributors", [{ userId: contributorId }]);
    dbMock.enqueueFor("select", "vouches", []);
    dbMock.enqueueFor("insert", "vouches", [vouch]);
    dbMock.enqueueFor("select", "engine_runs", []);
    dbMock.enqueueFor("insert", "engine_runs", []);
    dbMock.enqueueFor("execute", undefined, []);
    scriptAnswer(vouch);
    const response = await update({ vouch: { weight: 1.5, confirmsAlone: true, reason: "Known to the team" }, refold: true });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({
      weight: { computed: 0.1, effective: 1.5 },
      vouch: { weight: 1.5, confirmsAlone: true, by: { id: STAFF_ID }, endsAt: null },
      block: null,
    });
    expect(writes("insert", "vouches")).toEqual([
      { userId: contributorId, weight: 1.5, confirmsAlone: true, reason: "Known to the team", until: null, vouchedById: STAFF_ID },
    ]);
    expect(writes("insert", "engine_runs")).toEqual([{ kind: "refold", params: { userId: contributorId } }]);
    expect(writes("insert", "audit_operations")[0]).toMatchObject({ kind: "observations.contributor_vouch" });
    expect(writes("insert", "audit_logs")[0]).toMatchObject([{ entity: "vouches", op: "create", record_id: contributorId }]);
  });

  it("withdraws a vouch", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "contributors", [{ userId: contributorId }]);
    dbMock.enqueueFor("select", "vouches", [vouch]);
    dbMock.enqueueFor("delete", "vouches", []);
    scriptAnswer(null);
    const response = await update({ vouch: null });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.vouch).toBeNull();
    expect(writes("insert", "audit_logs")[0]).toMatchObject([{ entity: "vouches", op: "delete", record_id: contributorId }]);
  });

  it("blocks a person until a date, audited as a block", async () => {
    const until = new Date(Date.now() + 86_400_000);
    const block = { userId: contributorId, blockedAt: vouchedAt, blockedById: STAFF_ID, reason: "Fake readings", until };
    scriptAudit();
    dbMock.enqueueFor("select", "contributors", [{ userId: contributorId }]);
    dbMock.enqueueFor("select", "contributor_blocks", []);
    dbMock.enqueueFor("insert", "contributor_blocks", [block]);
    scriptAnswer(null, block);
    const response = await update({ block: { reason: "Fake readings", endsAt: until.toISOString() } });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.block).toEqual({ reason: "Fake readings", by: staff, at: vouchedAt.toISOString(), endsAt: until.toISOString() });
    expect(writes("insert", "contributor_blocks")).toEqual([{ userId: contributorId, reason: "Fake readings", until, blockedById: STAFF_ID }]);
    expect(writes("insert", "audit_operations")[0]).toMatchObject({ kind: "observations.contributor_block" });
  });

  it("writes and audits nothing for the vouch the person already has", async () => {
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("select", "contributors", [{ userId: contributorId }]);
    dbMock.enqueueFor("select", "vouches", [{ ...vouch, weight: Math.fround(1.5), vouchedById: "55555555-5555-4555-8555-555555555555" }]);
    dbMock.enqueueFor("delete", "audit_operations", []);
    scriptAnswer(vouch);
    const response = await update({ vouch: { weight: 1.5, confirmsAlone: true, reason: "Known to the team" } });

    expect(response.statusCode, response.body).toBe(200);
    expect(writes("insert", "vouches")).toEqual([]);
    expect(writes("insert", "audit_logs")).toEqual([]);
    expect(writes("delete", "audit_operations")).toHaveLength(1);
  });

  it("writes and audits nothing for the block the person already has", async () => {
    const until = new Date(Date.now() + 86_400_000);
    const block = { userId: contributorId, blockedAt: vouchedAt, blockedById: STAFF_ID, reason: "Fake readings", until };
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("select", "contributors", [{ userId: contributorId }]);
    dbMock.enqueueFor("select", "contributor_blocks", [block]);
    dbMock.enqueueFor("delete", "audit_operations", []);
    scriptAnswer(null, block);
    const response = await update({ block: { reason: "Fake readings", endsAt: until.toISOString() } });

    expect(response.statusCode, response.body).toBe(200);
    expect(writes("insert", "contributor_blocks")).toEqual([]);
    expect(writes("insert", "audit_logs")).toEqual([]);
  });

  it("queues no second refold while the same one waits", async () => {
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("select", "contributors", [{ userId: contributorId }]);
    dbMock.enqueueFor("select", "vouches", [vouch]);
    dbMock.enqueueFor("select", "engine_runs", [{ id: "01a12096-8da0-7c1d-9b2e-000000000001" }]);
    scriptAnswer(vouch);
    const response = await update({ vouch: { weight: 1.5, confirmsAlone: true, reason: "Known to the team" }, refold: true });

    expect(response.statusCode, response.body).toBe(200);
    expect(writes("insert", "engine_runs")).toEqual([]);
  });

  it("answers 404 for someone who never accepted the contributor terms", async () => {
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("select", "contributors", []);
    expectError(await update({ vouch: null }), 404, "NOT_FOUND");
  });

  it.each([
    {
      name: "a vouch and a block together",
      payload: { vouch: { weight: 1, reason: "Both" }, block: { reason: "Both" } },
      details: [{ field: "block", validationMessage: "Send it in a request of its own" }],
    },
    {
      name: "a vouch that has ended",
      payload: { vouch: { weight: 1, reason: "Ended", endsAt: "2020-01-01T00:00:00Z" } },
      details: [{ field: "vouch.endsAt", validationMessage: "Must lie in the future" }],
    },
  ])("refuses $name", async ({ payload, details }) => {
    const response = await update(payload);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual(details);
  });
});
