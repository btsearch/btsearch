import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { decodeCursor } from "../../../../../../src/lib/cursor.js";
import route from "../../../../../../src/routes/v2/(get)/official/import-runs/index.js";
import { dbMock } from "../../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import { OTHER_RUN_ID, RUN_ID, STAFF_ID, runRow, scriptRunParts, signInAs } from "../../../../../helpers/officialFixtures.js";

const request = { method: "GET" as const, url: "/official/import-runs" };
const QUEUED_AT_KEY = "1760256000000000";
const finished: typeof runRow = {
  ...runRow,
  state: "done",
  attempt: 1,
  claimedAt: new Date("2026-10-12T08:00:05.000Z"),
  heartbeatAt: new Date("2026-10-12T08:03:00.000Z"),
  startedAt: new Date("2026-10-12T08:00:05.000Z"),
  finishedAt: new Date("2026-10-12T08:03:00.000Z"),
};
const scheduled: typeof runRow = {
  ...runRow,
  id: OTHER_RUN_ID,
  trigger: "scheduled",
  requestedById: null,
  state: "failed",
  error: "The runner stopped",
  attempt: 5,
};

function listed(run: typeof runRow) {
  return { run, sourceKey: "test-register", key: QUEUED_AT_KEY };
}

describe("GET /official/import-runs", () => {
  it("returns each run with what is read from its datasets, slices and change set", async () => {
    dbMock.enqueueFor("select", "official.import_runs", [listed(finished), listed(scheduled)]);
    scriptRunParts(finished, {
      datasets: [
        { runId: RUN_ID, datasetId: 11, datasetKey: "permits", error: null },
        { runId: RUN_ID, datasetId: 12, datasetKey: "microwave-links", error: "The listing page has no file" },
        { runId: OTHER_RUN_ID, datasetId: 11, datasetKey: "permits", error: null },
      ],
      heldRunIds: [RUN_ID],
      changes: [
        { runId: RUN_ID, datasetId: 11, slice: "LTE:800:commercial", kind: "permit_added", changes: 3 },
        { runId: RUN_ID, datasetId: 11, slice: "NR:3500:commercial", kind: "permit_added", changes: 2 },
        { runId: RUN_ID, datasetId: 11, slice: "NR:3500:commercial", kind: "site_added", changes: 1 },
        { runId: RUN_ID, datasetId: null, slice: null, kind: "station_linked", changes: 4 },
      ],
    });
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({
      data: [
        {
          id: RUN_ID,
          sourceKey: "test-register",
          kind: "import",
          trigger: "manual",
          isDryRun: false,
          status: "done",
          error: null,
          attempt: 1,
          requester: { id: STAFF_ID, username: "staff", name: "Staff Member", image: null },
          remap: null,
          datasets: [
            { datasetId: 11, datasetKey: "permits", error: null },
            { datasetId: 12, datasetKey: "microwave-links", error: "The listing page has no file" },
          ],
          hasHeldSlices: true,
          changes: [
            { kind: "siteAdded", count: 1 },
            { kind: "permitAdded", count: 5 },
            { kind: "stationLinked", count: 4 },
          ],
          createdAt: "2026-10-12T08:00:00.000Z",
          startedAt: "2026-10-12T08:00:05.000Z",
          claimedAt: "2026-10-12T08:00:05.000Z",
          heartbeatAt: "2026-10-12T08:03:00.000Z",
          finishedAt: "2026-10-12T08:03:00.000Z",
        },
        {
          id: OTHER_RUN_ID,
          sourceKey: "test-register",
          kind: "import",
          trigger: "scheduled",
          isDryRun: false,
          status: "failed",
          error: "The runner stopped",
          attempt: 5,
          requester: null,
          remap: null,
          datasets: [{ datasetId: 11, datasetKey: "permits", error: null }],
          hasHeldSlices: false,
          changes: [],
          createdAt: "2026-10-12T08:00:00.000Z",
          startedAt: null,
          claimedAt: null,
          heartbeatAt: null,
          finishedAt: null,
        },
      ],
      paging: { limit: 50, nextCursor: null },
    });
    expect(response.json().data[0]).not.toHaveProperty("claimToken");
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("filters by source, kind, status and dry run in one query", async () => {
    dbMock.enqueueFor("select", "official.import_runs", []);
    const url = "/official/import-runs?sourceKeys=test-register,other-register&kinds=replay,remap&statuses=queued,running&isDryRun=true";
    const response = await injectMutation(route, { ...request, url }, signInAs("admin"));
    expect(response.json()).toEqual({ data: [], paging: { limit: 50, nextCursor: null } });
    expect(whereQuery("official.import_runs", "select").params).toEqual([
      "test-register",
      "other-register",
      "replay",
      "remap",
      "queued",
      "running",
      true,
    ]);
    expect(dbMock.calls).toHaveLength(1);
  });

  it("pages newest first and continues after the last run of the page", async () => {
    dbMock.enqueueFor("select", "official.import_runs", [listed(runRow), listed(scheduled)]);
    scriptRunParts(runRow);
    const first = await injectMutation(route, { ...request, url: "/official/import-runs?limit=1" }, signInAs("admin"));
    const { nextCursor } = first.json().paging;
    expect(first.json().data).toHaveLength(1);
    expect(decodeCursor(nextCursor, z.unknown())).toEqual({ sort: "-createdAt", id: RUN_ID, key: QUEUED_AT_KEY });

    dbMock.enqueueFor("select", "official.import_runs", []);
    await injectMutation(route, { ...request, url: `/official/import-runs?limit=1&cursor=${nextCursor}` }, signInAs("admin"));
    expect(whereQuery("official.import_runs", "select", 1).params).toEqual([QUEUED_AT_KEY, RUN_ID]);
  });

  it.each(["kinds=upload", "statuses=held", "isDryRun=1", "limit=0", "sourceId=1", "sourceKeys=", "cursor=bm90IGEgY3Vyc29y"])(
    "rejects the invalid query %s",
    async (query) => {
      const response = await injectMutation(route, { ...request, url: `/official/import-runs?${query}` }, signInAs("admin"));
      expect(response.statusCode).toBe(400);
      expect(dbMock.calls).toEqual([]);
    },
  );

  it("refuses an editor before reading anything", async () => {
    expectError(await injectMutation(route, request, signInAs("editor")), 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toEqual([]);
  });
});
