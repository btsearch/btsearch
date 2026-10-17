import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type DirectoryArchive, archiveKeyOf, directoryArchive } from "../../../../../src/features/official/import/archive.js";
import { processDryRun } from "../../../../../src/features/official/import/run.js";
import { prune } from "../../../../../src/features/official/import/steps/prune.js";
import type { DbTx } from "../../../../../src/types/global.js";
import { logger } from "../../../../../src/utils/logger.js";
import { dbMock } from "../../../../helpers/boundaries.js";
import {
  RUN_ID,
  claimedRun,
  ownRun,
  recordTransactions,
  runStep,
  scriptStepFinish,
  scriptStepStart,
  sourceOf,
  trace,
  transactionsOf,
  valuesOf,
  whereOf,
} from "../../../../helpers/importEngineFixtures.js";

type ArchivedFile = { sha256: string; mediaType: string; sizeBytes: number };

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const ZIP = "application/zip";
const READ_PRUNABLE_FILES: readonly (readonly [RegExp, string])[] = [[/^WITH newest AS/, "read the files no kept release uses"]];

let directory: string;
let archive: DirectoryArchive;

function archiveFile(name: string, mediaType = XLSX): ArchivedFile {
  const content = Buffer.from(`the content of ${name}`);
  const sha256 = createHash("sha256").update(content).digest("hex");
  const filePath = path.join(directory, archiveKeyOf(sha256, mediaType));
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);

  return { sha256, mediaType, sizeBytes: content.length };
}

function isArchived({ sha256, mediaType }: ArchivedFile): boolean {
  return existsSync(path.join(directory, archiveKeyOf(sha256, mediaType)));
}

function scriptPrunableFiles(files: readonly ArchivedFile[]): void {
  ownRun(1);
  dbMock.enqueueFor("execute", undefined, [...files]);
}

function scriptRunsDeleted(): void {
  ownRun(1);
  dbMock.enqueueFor("delete", "official.import_runs", undefined);
  dbMock.enqueueFor("update", "official.import_run_steps", undefined);
}

beforeEach(() => {
  recordTransactions();
  directory = mkdtempSync(path.join(tmpdir(), "official-archive-prune-"));
  archive = directoryArchive(directory);
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("the prune step", () => {
  it("deletes the older runs that have ended, and finishes in the same transaction", async () => {
    scriptStepStart();
    scriptPrunableFiles([]);
    scriptRunsDeleted();
    scriptStepFinish();

    await runStep(prune, { run: claimedRun({ startedAt: new Date("2026-10-12T14:15:16.789Z") }), archive });

    expect(dbMock.pendingResults()).toBe(0);
    const [, read, work] = transactionsOf(trace(READ_PRUNABLE_FILES));
    expect(read).toEqual(["select official.import_runs", "read the files no kept release uses", "commit"]);
    expect(work).toEqual(["select official.import_runs", "delete official.import_runs", "update official.import_run_steps", "commit"]);
    expect(whereOf(dbMock.calls.find((call) => call.operation === "delete"))).toEqual({
      sql: '(("official"."import_runs"."created_at" < $1) and ("official"."import_runs"."state" in ($2, $3, $4)))',
      params: ["2026-04-15T14:15:16.789Z", "done", "failed", "cancelled"],
    });
  });
});

describe("pruning the archive", () => {
  it("removes the files the database names, leaves every other file, and logs what it freed", async () => {
    const applied = archiveFile("the applied release");
    const newest = archiveFile("the newest release, held");
    const shared = archiveFile("a file a kept release of another source also uses");
    const otherSource = archiveFile("another source's release, downloaded but not applied yet");
    const older = archiveFile("an older release");
    const olderZip = archiveFile("an older zipped release", ZIP);
    scriptStepStart();
    scriptPrunableFiles([older, olderZip]);
    scriptRunsDeleted();
    scriptStepFinish();

    await runStep(prune, { archive });

    expect(dbMock.pendingResults()).toBe(0);
    expect([older, olderZip].map(isArchived)).toEqual([false, false]);
    expect([applied, newest, shared, otherSource].map(isArchived)).toEqual([true, true, true, true]);
    expect(logger.info).toHaveBeenCalledWith("official.import.archive_pruned", {
      runId: RUN_ID,
      files: 2,
      bytes: older.sizeBytes + olderZip.sizeBytes,
    });
  });

  it("records a file it cannot remove, goes on with the others, and finishes the step", async () => {
    const stuck = archiveFile("a file the runner may not remove");
    const older = archiveFile("an older release");
    const refusing: DirectoryArchive = {
      ...archive,
      async remove(key) {
        if (key.includes(stuck.sha256)) throw new Error("EACCES: permission denied");
        return archive.remove(key);
      },
    };
    scriptStepStart();
    scriptPrunableFiles([stuck, older]);
    ownRun(1);
    dbMock.enqueueFor("update", "official.import_run_steps", undefined);
    scriptRunsDeleted();
    scriptStepFinish();

    await expect(runStep(prune, { archive: refusing })).resolves.toBeUndefined();

    expect(dbMock.pendingResults()).toBe(0);
    expect([stuck, older].map(isArchived)).toEqual([true, false]);
    expect(valuesOf("update", "official.import_run_steps")[0]).toEqual({ error: "EACCES: permission denied" });
    expect(logger.error).toHaveBeenCalledWith("official.import.prune", { runId: RUN_ID, error: new Error("EACCES: permission denied") });
    expect(logger.info).toHaveBeenCalledWith("official.import.archive_pruned", { runId: RUN_ID, files: 1, bytes: older.sizeBytes });
  });

  it("prunes nothing in a dry run", async () => {
    const older = archiveFile("an older release");
    const environment = {
      sources: [sourceOf()],
      database: dbMock as unknown as DbTx,
      archive,
      steps: [prune],
      keepDryRunReport: async () => undefined,
    };
    dbMock.enqueueFor("select", "official.import_run_datasets", [], []);
    ownRun(2);
    dbMock.enqueueFor("select", "official.licensees", []);
    dbMock.enqueueFor("select", "official.import_run_slices", []);
    dbMock.enqueueFor("select", "official.import_run_skips", []);
    dbMock.enqueueFor("select", "official.import_changes", []);
    dbMock.enqueueFor("update", "official.import_runs", undefined);

    const end = await processDryRun(claimedRun({ isDryRun: true }), environment);

    expect(end).toMatchObject({ end: "done" });
    expect(dbMock.pendingResults()).toBe(0);
    expect(isArchived(older)).toBe(true);
    expect(dbMock.calls.filter((call) => call.operation === "execute" || call.table === "official.import_run_steps")).toEqual([]);
  });
});
