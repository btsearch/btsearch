import { describe, expect, it } from "vitest";

import route from "../../../../../../src/routes/v2/(post)/observed/engine/runs.js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { injectMutation } from "../../../../../helpers/mutationAssertions.js";
import { STAFF_ID, signInAs } from "../../../../../helpers/officialFixtures.js";

const runId = "019a1b2c-0000-7000-8000-000000000002";
const userId = "22222222-2222-4222-8222-222222222222";

function start(payload: object) {
  return injectMutation(route, { method: "POST", url: "/observed/engine/runs", payload }, signInAs("admin"));
}

const queuedRefold = {
  run: {
    id: runId,
    kind: "refold",
    params: { userId },
    requestedById: STAFF_ID,
    createdAt: new Date("2026-10-25T09:00:00Z"),
    startedAt: null,
    finishedAt: null,
    outcome: null,
    progress: null,
    error: null,
  },
  requestedBy: { id: STAFF_ID, username: "staff", name: "Staff Member", image: null },
};

function insertedRun() {
  return dbMock.calls.find((call) => call.operation === "insert" && call.table === "engine_runs")?.values;
}

describe("POST /observed/engine/runs", () => {
  it("queues a re-fold of one person's uploads and wakes the engine", async () => {
    dbMock.enqueueFor("insert", "engine_runs", [{ id: runId }]);
    dbMock.enqueueFor("execute", undefined, []);
    dbMock.enqueueFor("select", "engine_runs", [queuedRefold]);
    const response = await start({ kind: "refold", params: { userId } });

    expect(response.statusCode).toBe(201);
    expect(response.json().data).toMatchObject({ id: runId, kind: "refold", startedAt: null, requestedBy: { id: STAFF_ID } });
    expect(insertedRun()).toEqual({ kind: "refold", params: { userId }, requestedById: STAFF_ID });
    expect(dbMock.execute).toHaveBeenCalledOnce();
  });

  it("points at the value of a refold scope that is wrong, and at a key no scope takes", async () => {
    const wrongValue = await start({ kind: "refold", params: { userId: "not-a-uuid" } });
    const unknownKey = await start({ kind: "refold", params: { stationId: 4 } });

    expect(wrongValue.statusCode).toBe(400);
    expect(wrongValue.json().errors[0].details).toEqual([{ field: "params/userId", validationMessage: "Invalid UUID" }]);
    expect(unknownKey.json().errors[0].details).toEqual([{ field: "params", validationMessage: 'Unrecognized key: "stationId"' }]);
    expect(insertedRun()).toBeUndefined();
  });
});
