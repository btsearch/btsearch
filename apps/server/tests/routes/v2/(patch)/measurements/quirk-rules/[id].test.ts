import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(patch)/measurements/quirk-rules/[id].js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { injectMutation, scriptAudit } from "../../../../../helpers/mutationAssertions.js";
import { STAFF_ID, signInAs } from "../../../../../helpers/officialFixtures.js";

const ruleId = "samsung-earfcn-offset";
const block = { reason: "Shifts channels that were right", blockedAt: new Date("2026-10-25T09:00:00Z") };

function ruleRow(blocked: typeof block | null = null) {
  return {
    rule: { id: ruleId, readerName: "btsearch", firstSeenAt: new Date("2026-10-20T10:00:00Z") },
    block: blocked,
    blockedBy: blocked === null ? null : { id: STAFF_ID, username: "staff", name: "Staff Member", image: null },
  };
}

function writes(operation: string, table: string) {
  return dbMock.calls.filter((call) => call.operation === operation && call.table === table);
}

describe("PATCH /measurements/quirk-rules/:id", () => {
  it("blocks a rule, audits it, and folds again the uploads it corrected", async () => {
    scriptAudit();
    dbMock.enqueueFor("select", "quirk_rules", [ruleRow()], [ruleRow(block)]);
    dbMock.enqueueFor("insert", "blocked_quirk_rules", [{ quirkRuleId: ruleId, ...block, blockedById: STAFF_ID }]);
    dbMock.enqueueFor("select", "engine_runs", []);
    dbMock.enqueueFor("insert", "engine_runs", []);
    dbMock.enqueueFor("execute", undefined, []);
    const response = await injectMutation(
      route,
      { method: "PATCH", url: `/measurements/quirk-rules/${ruleId}`, payload: { block: { reason: block.reason }, refold: true } },
      signInAs("admin"),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      id: ruleId,
      block: { reason: block.reason, by: { id: STAFF_ID }, at: block.blockedAt.toISOString() },
    });
    expect(writes("insert", "engine_runs")[0]?.values).toEqual({ kind: "refold", params: { quirkRuleId: ruleId } });
    expect(writes("insert", "audit_operations")[0]?.values).toMatchObject({ kind: "observations.quirk_rule_block" });
  });
});
