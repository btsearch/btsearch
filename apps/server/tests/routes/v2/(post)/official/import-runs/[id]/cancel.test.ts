import { describe, expect, it } from "vitest";

import route from "../../../../../../../src/routes/v2/(post)/official/import-runs/[id]/cancel.js";
import { dbMock } from "../../../../../../helpers/boundaries.js";
import { expectError, injectMutation, whereQuery } from "../../../../../../helpers/mutationAssertions.js";
import { RUN_ID, runRow, scriptStoredRun, signInAs } from "../../../../../../helpers/officialFixtures.js";

const request = { method: "POST" as const, url: `/official/import-runs/${RUN_ID}/cancel` };
const cancelled: typeof runRow = { ...runRow, state: "cancelled", finishedAt: new Date("2026-10-12T08:01:00.000Z") };

describe("POST /official/import-runs/:id/cancel", () => {
  it("cancels a queued or running run and answers it", async () => {
    dbMock.enqueueFor("select", "official.import_runs", [{ id: RUN_ID }]);
    dbMock.enqueueFor("update", "official.import_runs", [{ id: RUN_ID }]);
    scriptStoredRun(cancelled);
    const response = await injectMutation(route, request, signInAs("admin"));
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data).toMatchObject({ id: RUN_ID, status: "cancelled", finishedAt: "2026-10-12T08:01:00.000Z" });
    expect(dbMock.calls.find((call) => call.operation === "update")?.values).toMatchObject({ state: "cancelled" });
    expect(whereQuery("official.import_runs", "update").params).toEqual([RUN_ID, "queued", "running"]);
    expect(dbMock.pendingResults()).toBe(0);
  });

  it("answers 409 for a run that has already ended", async () => {
    dbMock.enqueueFor("select", "official.import_runs", [{ id: RUN_ID }]);
    dbMock.enqueueFor("update", "official.import_runs", []);
    expectError(await injectMutation(route, request, signInAs("admin")), 409, "CONFLICT", "This import run has already ended");
  });

  it("returns 404 for an unknown run without writing", async () => {
    dbMock.enqueueFor("select", "official.import_runs", []);
    expectError(await injectMutation(route, request, signInAs("admin")), 404, "NOT_FOUND");
    expect(dbMock.calls.some((call) => call.operation === "update")).toBe(false);
  });

  it("rejects an id that is not a UUID", async () => {
    expectError(await injectMutation(route, { ...request, url: "/official/import-runs/17/cancel" }, signInAs("admin")), 400, "VALIDATION_ERROR");
    expect(dbMock.calls).toEqual([]);
  });

  it("refuses an editor before reading anything", async () => {
    expectError(await injectMutation(route, request, signInAs("editor")), 403, "INSUFFICIENT_PERMISSIONS");
    expect(dbMock.calls).toEqual([]);
  });
});
