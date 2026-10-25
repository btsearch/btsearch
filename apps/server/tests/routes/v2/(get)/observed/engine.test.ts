import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import getEngine from "../../../../../src/routes/v2/(get)/observed/engine.js";
import getEngineRun from "../../../../../src/routes/v2/(get)/observed/engine/runs/[id].js";
import { dbMock, redisMock } from "../../../../helpers/boundaries.js";
import { crowdSettingsRow } from "../../../../helpers/measurementFixtures.js";
import { expectError, injectMutation } from "../../../../helpers/mutationAssertions.js";
import { STAFF_ID, signInAs } from "../../../../helpers/officialFixtures.js";

const runId = "019a1b2c-0000-7000-8000-000000000001";
const createdAt = new Date("2026-10-25T01:00:00Z");
let directory: string;

function runRow(overrides: Record<string, unknown> = {}, requestedBy: object | null = null) {
  return {
    run: {
      id: runId,
      kind: "recalibrate",
      params: {},
      requestedById: null,
      createdAt,
      startedAt: createdAt,
      finishedAt: new Date("2026-10-25T01:06:00Z"),
      outcome: "done",
      progress: { done: 1, total: null, failed: 0 },
      error: null,
      ...overrides,
    },
    requestedBy,
  };
}

function read(route: typeof getEngine | typeof getEngineRun, url: string) {
  return injectMutation(route, { method: "GET", url }, signInAs("admin"));
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "engine-state-"));
  vi.stubEnv("OBSERVATIONS_DIR", directory);
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe("GET /observed/engine", () => {
  it("counts what waits for the engine and lists its runs", async () => {
    const oldestWaitingAt = new Date("2026-10-25T08:40:00Z");
    await redisMock.set("measurements:stored-bytes", String(5 * 1024 ** 3));
    dbMock.enqueueFor("select", "engine_heartbeats", [{ instance: "engine-1", startedAt: createdAt, seenAt: new Date("2026-10-25T09:00:00Z") }]);
    dbMock.enqueueFor(
      "select",
      "uploads",
      [{ waiting: 4, oldestWaitingAt }],
      [{ due: 1 }],
      [
        { status: "processed", ended: 30 },
        { status: "rejected", ended: 2 },
      ],
      [{ uploadId: "01a12096-8da0-7c1d-9b2e-5f6a7b8c9d0e", status: "received", attempts: 2, error: "connection reset", receivedAt: oldestWaitingAt }],
    );
    dbMock.enqueueFor("count", "dirty_sites", 3);
    dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
    dbMock.enqueueFor("execute", undefined, [{ bytes: "123456789" }]);
    dbMock.enqueueFor(
      "select",
      "engine_runs",
      [runRow()],
      [
        runRow(
          { kind: "refold", params: { userId: STAFF_ID }, progress: "not progress" },
          { id: STAFF_ID, username: "staff", name: "Staff Member", image: null },
        ),
      ],
    );
    const response = await read(getEngine, "/observed/engine");

    expect(response.statusCode).toBe(200);
    const state = response.json().data;
    expect(state).toMatchObject({
      uploads: { waiting: 4, oldestWaitingAt: oldestWaitingAt.toISOString(), subtractionsWaiting: 1, processedLastDay: 30, rejectedLastDay: 2 },
      sitesWaiting: 3,
      storage: { storedBytes: 5 * 1024 ** 3, budgetBytes: 100 * 1024 ** 3, disk: { freeBytes: expect.any(Number), totalBytes: expect.any(Number) } },
      databaseBytes: 123456789,
      latestErrors: [{ error: "connection reset", attempts: 2 }],
    });
    expect(state.nightlyRuns[0]).toMatchObject({ kind: "recalibrate", progress: { done: 1, total: null, failed: 0 }, requestedBy: null });
    expect(state.recentRuns[0]).toMatchObject({ kind: "refold", params: { userId: STAFF_ID }, progress: null, requestedBy: { username: "staff" } });
  });
});

describe("GET /observed/engine/runs/:id", () => {
  it("answers 404 for a run that does not exist", async () => {
    dbMock.enqueueFor("select", "engine_runs", []);
    expectError(await read(getEngineRun, `/observed/engine/runs/${runId}`), 404, "NOT_FOUND");
  });
});
