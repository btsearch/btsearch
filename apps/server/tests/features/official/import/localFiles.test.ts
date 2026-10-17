import type { LocalFile, Release, SitesDataset } from "@openbts/country-packs/sources";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { archiveFromEnvironment, directoryArchive } from "../../../../src/features/official/import/archive.js";
import { prepareReleases } from "../../../../src/features/official/import/datasets.js";
import { releaseHashOf } from "../../../../src/features/official/import/download.js";
import type { ClaimedRun, RunDataset, RunScope } from "../../../../src/features/official/import/types.js";
import type { DbTx } from "../../../../src/types/global.js";
import { dbMock } from "../../../helpers/boundaries.js";
import { claimedRun, sourceOf } from "../../../helpers/importEngineFixtures.js";

const CONTENT = Buffer.from("not a workbook: a local file is taken as it is");
const CONTENT_SHA256 = createHash("sha256").update(CONTENT).digest("hex");
const reader = dbMock as unknown as DbTx;

let directory: string;
let localPath: string;

function scopeOf(run: Partial<ClaimedRun>): RunScope {
  return { run: claimedRun(run), source: sourceOf(), database: reader, signal: new AbortController().signal, siteNames: { written: 0, skipped: 0 } };
}

function datasetWith(release: Release): RunDataset {
  const definition: SitesDataset = {
    key: "towers",
    layer: "sites",
    checkEveryHours: 6,
    discover: async () => [release],
    parse: async function* none() {},
  };

  return { id: 1, key: "towers", holdShrinkPercent: null, definition };
}

function scriptNothingStored(): void {
  dbMock.enqueueFor("select", "official.import_run_slices", []);
  dbMock.enqueueFor("select", "official.import_run_approvals", []);
  dbMock.enqueueFor("select", "official.listed_files", []);
}

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "official-local-file-"));
  localPath = path.join(directory, "2026-10-01_north.xlsx");
  writeFileSync(localPath, CONTENT);
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
});

describe("a release whose files are local", () => {
  it.each<[string, Partial<ClaimedRun>, boolean]>([
    ["an import archives it", {}, true],
    ["a dry run does not archive it", { isDryRun: true }, false],
  ])("is read from disk without asking the publisher: %s", async (_case, run, isArchived) => {
    const file: LocalFile = { url: pathToFileURL(localPath).href, fileName: "2026-10-01_north.xlsx", path: localPath };
    const release: Release = { coveredSlices: ["north"], files: [file], publishedOn: "2026-10-01" };
    const workspace = { scope: scopeOf(run), archive: directoryArchive(path.join(directory, "archive")), directory };
    scriptNothingStored();

    const prepared = await prepareReleases(reader, workspace, datasetWith(release));

    expect(fetch).not.toHaveBeenCalled();
    expect(prepared).toHaveLength(1);
    expect(prepared[0]?.release).toBe(release);
    expect(prepared[0]?.sha256).toBe(releaseHashOf([CONTENT_SHA256]));
    expect(prepared[0]?.files).toEqual([
      {
        url: file.url,
        fileName: "2026-10-01_north.xlsx",
        path: path.join(directory, "towers-0-0.xlsx"),
        sha256: CONTENT_SHA256,
        fresh: { sizeBytes: CONTENT.length, head: null },
      },
    ]);
    expect(readFileSync(path.join(directory, "towers-0-0.xlsx"))).toEqual(CONTENT);
    expect(readFileSync(localPath)).toEqual(CONTENT);
    expect(existsSync(path.join(directory, "archive", "files", `${CONTENT_SHA256}.xlsx`))).toBe(isArchived);
  });

  it("fails the dataset when the file is not there", async () => {
    const file: LocalFile = { url: "file:///absent.xlsx", fileName: "absent.xlsx", path: path.join(directory, "absent.xlsx") };
    const workspace = { scope: scopeOf({}), archive: directoryArchive(path.join(directory, "archive")), directory };
    scriptNothingStored();

    await expect(prepareReleases(reader, workspace, datasetWith({ coveredSlices: ["north"], files: [file], publishedOn: null }))).rejects.toThrow(
      "ENOENT",
    );
  });
});

describe("the archive of the environment", () => {
  it("is the directory that OFFICIAL_ARCHIVE_DIR names", async () => {
    vi.stubEnv("OFFICIAL_ARCHIVE_DIR", path.join(directory, "archive"));

    await archiveFromEnvironment().put("files/content.xlsx", localPath);

    expect(readFileSync(path.join(directory, "archive", "files", "content.xlsx"))).toEqual(CONTENT);
  });
});

describe("removing a file from the archive", () => {
  it("removes only the file of that key, and says whether it was there", async () => {
    const archive = directoryArchive(path.join(directory, "archive"));
    await archive.put("files/gone.xlsx", localPath);
    await archive.put("files/kept.xlsx", localPath);

    expect(await archive.remove("files/gone.xlsx")).toBe(true);
    expect(await archive.has("files/gone.xlsx")).toBe(false);
    expect(readFileSync(path.join(directory, "archive", "files", "kept.xlsx"))).toEqual(CONTENT);
  });

  it("takes a missing file, or a missing archive, as nothing to remove", async () => {
    const archive = directoryArchive(path.join(directory, "archive"));
    await archive.put("files/gone.xlsx", localPath);
    await archive.remove("files/gone.xlsx");

    expect(await archive.remove("files/gone.xlsx")).toBe(false);
    expect(await directoryArchive(path.join(directory, "never-made")).remove("files/gone.xlsx")).toBe(false);
  });

  it("fails when the file is there but cannot be removed", async () => {
    mkdirSync(path.join(directory, "archive", "files", "stuck.xlsx"), { recursive: true });

    await expect(directoryArchive(path.join(directory, "archive")).remove("files/stuck.xlsx")).rejects.toThrow("unlink");
  });
});
