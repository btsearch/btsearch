import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(patch)/measurements/reading-blocks/[id].js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { readingBlockRow } from "../../../../../helpers/measurementFixtures.js";
import { expectError, injectMutation, scriptAudit } from "../../../../../helpers/mutationAssertions.js";
import { STAFF_ID, signInAs } from "../../../../../helpers/officialFixtures.js";

const switchedOffAt = new Date("2026-10-24T12:00:00Z");

function update(payload: object) {
  return injectMutation(route, { method: "PATCH", url: "/measurements/reading-blocks/2", payload }, signInAs("admin"));
}

function writes(operation: string, table: string) {
  return dbMock.calls.filter((call) => call.operation === operation && call.table === table);
}

describe("PATCH /measurements/reading-blocks/:id", () => {
  it("switches a block off, answers who did it, audits it, and folds again the uploads it acted on", async () => {
    const switchedOff = readingBlockRow({ disabledAt: switchedOffAt, disabledById: STAFF_ID });
    scriptAudit();
    dbMock.enqueueFor("select", "reading_blocks", [readingBlockRow().block], [switchedOff]);
    dbMock.enqueueFor("update", "reading_blocks", [switchedOff.block]);
    dbMock.enqueueFor("select", "engine_runs", []);
    dbMock.enqueueFor("insert", "engine_runs", []);
    dbMock.enqueueFor("execute", undefined, []);
    const response = await update({ isEnabled: false, refold: true });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({ isEnabled: false, disabledBy: { id: STAFF_ID }, disabledAt: switchedOffAt.toISOString() });
    expect(writes("update", "reading_blocks")[0]?.values).toMatchObject({ disabledById: STAFF_ID });
    expect(writes("insert", "engine_runs")[0]?.values).toEqual({ kind: "refold", params: { readingBlockId: 2 } });
    expect(writes("insert", "audit_operations")[0]?.values).toMatchObject({ kind: "observations.reading_block_update" });
  });

  it("writes nothing for a reason and a switch the block already has", async () => {
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("delete", "audit_operations", []);
    dbMock.enqueueFor("select", "reading_blocks", [readingBlockRow().block], [readingBlockRow()]);
    const response = await update({ reason: "Samsung modems misreport", isEnabled: true });

    expect(response.statusCode).toBe(200);
    expect(writes("update", "reading_blocks")).toEqual([]);
  });

  it("answers 404 for a block that does not exist", async () => {
    dbMock.enqueueFor("insert", "audit_operations", [{ id: 1 }]);
    dbMock.enqueueFor("select", "reading_blocks", []);
    expectError(await update({ isEnabled: false }), 404, "NOT_FOUND");
  });
});
