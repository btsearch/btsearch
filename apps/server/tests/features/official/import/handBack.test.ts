import { describe, expect, it } from "vitest";

import { directoryArchive } from "../../../../src/features/official/import/archive.js";
import { runnerEngineOf } from "../../../../src/features/official/import/runner.js";
import { RunNotOwnedError, claimRun, releaseRun } from "../../../../src/features/official/import/runs.js";
import type { ImportEnvironment } from "../../../../src/features/official/import/types.js";
import type { DbTx } from "../../../../src/types/global.js";
import { dbMock } from "../../../helpers/boundaries.js";
import { FOREIGN_TOKEN, RUN_ID, claimedRun, statementOf } from "../../../helpers/importEngineFixtures.js";

const tx = dbMock as unknown as DbTx;
const environment: ImportEnvironment = {
  sources: [],
  database: tx,
  archive: directoryArchive("unused"),
  steps: [],
  keepDryRunReport: async () => undefined,
};

const run = claimedRun({ attempt: 2 });
const claimedRow = {
  id: RUN_ID,
  sourceId: 1,
  sourceKey: "test-source",
  kind: "import",
  isDryRun: false,
  attempt: 1,
  startedAt: "2026-10-12T14:15:16.789Z",
};

function claimStatement(): { sql: string; params: unknown[] } {
  return statementOf(dbMock.calls[0]);
}

describe("handing a run back", () => {
  it("queues it again without its token and keeps its attempts", async () => {
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    await releaseRun(tx, RUN_ID);

    expect(dbMock.calls.map((call) => call.values)).toEqual([{ state: "queued", claimToken: null }]);
  });

  it.each([
    ["finished meanwhile", [{ claimToken: run.claimToken, state: "done" }]],
    ["was cancelled", [{ claimToken: run.claimToken, state: "cancelled" }]],
    ["was taken over", [{ claimToken: FOREIGN_TOKEN, state: "running" }]],
  ])("writes nothing for a run that %s", async (_case, rows) => {
    dbMock.enqueueFor("select", "official.import_runs", rows);

    const handBack = runnerEngineOf(environment).releaseRun(run);

    await expect(handBack).rejects.toBeInstanceOf(RunNotOwnedError);
    expect(dbMock.calls).toHaveLength(1);
  });
});

describe("claiming one run by its id", () => {
  it("adds the id to the claim that the runner uses", async () => {
    dbMock.enqueueFor("execute", undefined, [{ ...claimedRow, state: "running" }]);

    const claimed = await claimRun(RUN_ID);

    expect(claimed).toMatchObject({ id: RUN_ID, attempt: 1, startedAt: new Date("2026-10-12T14:15:16.789Z") });
    expect(claimStatement().sql).toContain("AND run.id = $2::uuid");
    expect(claimStatement().params).toEqual([10, RUN_ID, 5, 5, "Abandoned after 5 attempts", 5, claimed?.claimToken, 5, 5]);
  });
});
