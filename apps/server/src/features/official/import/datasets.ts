/* eslint-disable no-await-in-loop */
import type { LocalFile, OfficialSourceDefinition, Release, ReleaseFile } from "@openbts/country-packs/sources";
import { officialDatasets, officialImportRunDatasets } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import { copyFile, stat } from "node:fs/promises";
import path from "node:path";

import type { DbTx } from "../../../types/global.js";
import { logger } from "../../../utils/logger.js";
import { type DirectoryArchive, archiveKeyOf, mediaTypeOf } from "./archive.js";
import { readApprovals, readCheckpointedSlices } from "./checkpoints.js";
import { DOWNLOAD_TIMEOUT_MS, PAGE_TIMEOUT_MS } from "./config.js";
import { type FileHead, type ListedFile, downloadFile, hashFile, headFile, isListedUnchanged, releaseHashOf, timedFetch } from "./download.js";
import { readContextOf } from "./readContext.js";
import { readListedFiles } from "./snapshots.js";
import type { ObtainedFile, PreparedRelease, RunDataset, RunScope } from "./types.js";

type Reader = Pick<DbTx, "select">;
type StoredRunDataset = Pick<RunDataset, "id" | "key" | "holdShrinkPercent"> & { error: string | null };
type Workspace = { scope: RunScope; archive: DirectoryArchive; directory: string };
type CheckedFile = { file: ReleaseFile; head: FileHead | null; unchangedListing: ListedFile | undefined };
type FileDescription = { runId: string; datasetKey: string; url: string };
type ReleasePreparation = {
  workspace: Workspace;
  dataset: RunDataset;
  release: Release;
  releaseIndex: number;
  listedByUrl: ReadonlyMap<string, ListedFile>;
  mustRead: boolean;
};

export type RunDatasets = { ready: RunDataset[]; withoutReader: StoredRunDataset[] };

export async function readRunDatasets(reader: Reader, runId: string, source: OfficialSourceDefinition): Promise<RunDatasets> {
  const rows: StoredRunDataset[] = await reader
    .select({
      id: officialDatasets.id,
      key: officialDatasets.key,
      holdShrinkPercent: officialDatasets.holdShrinkPercent,
      error: officialImportRunDatasets.error,
    })
    .from(officialImportRunDatasets)
    .innerJoin(officialDatasets, eq(officialDatasets.id, officialImportRunDatasets.datasetId))
    .where(eq(officialImportRunDatasets.runId, runId));
  const pending = rows.filter((row) => row.error === null);

  return {
    ready: source.datasets.flatMap((definition) => {
      const row = pending.find(({ key }) => key === definition.key);
      return row ? [{ id: row.id, key: row.key, holdShrinkPercent: row.holdShrinkPercent, definition }] : [];
    }),
    withoutReader: pending.filter((row) => !source.datasets.some(({ key }) => key === row.key)),
  };
}

export function assertReleasesAreDisjoint(datasetKey: string, releases: readonly Release[]): void {
  const seenSlices = new Set<string>();
  for (const release of releases) {
    if (release.coveredSlices.length === 0 || release.files.length === 0) {
      throw new Error(`A release of ${datasetKey} covers no slice or lists no file`);
    }

    for (const slice of release.coveredSlices) {
      if (seenSlices.has(slice)) throw new Error(`Two releases of ${datasetKey} cover the slice "${slice}"`);
      seenSlices.add(slice);
    }
  }
}

function isLocalFile(file: ReleaseFile): file is LocalFile {
  return "path" in file;
}

function describeFile({ scope }: Workspace, dataset: RunDataset, file: ReleaseFile): FileDescription {
  return { runId: scope.run.id, datasetKey: dataset.key, url: file.url };
}

async function obtainFile(
  workspace: Workspace,
  dataset: RunDataset,
  { file, head, unchangedListing }: CheckedFile,
  filePath: string,
): Promise<ObtainedFile> {
  const { scope, archive } = workspace;
  const described = describeFile(workspace, dataset, file);
  const mediaType = mediaTypeOf(file.fileName);
  const listedSha256 = unchangedListing?.fileSha256 ?? null;
  if (listedSha256 !== null && (await archive.has(archiveKeyOf(listedSha256, mediaType)))) {
    await archive.fetchTo(archiveKeyOf(listedSha256, mediaType), filePath);
    logger.info("official.import.file_from_archive", described);
    return { ...file, path: filePath, sha256: listedSha256, fresh: null };
  }

  if (isLocalFile(file)) await copyFile(file.path, filePath);
  else {
    logger.info("official.import.downloading", { ...described, bytes: head?.sizeBytes ?? null });
    const startedAt = Date.now();
    await downloadFile(timedFetch(scope.signal, DOWNLOAD_TIMEOUT_MS), file, filePath);
    logger.info("official.import.downloaded", { ...described, bytes: (await stat(filePath)).size, ms: Date.now() - startedAt });
  }
  const { sha256, sizeBytes } = await hashFile(filePath);
  const archiveKey = archiveKeyOf(sha256, mediaType);
  if (!scope.run.isDryRun && !(await archive.has(archiveKey))) await archive.put(archiveKey, filePath);

  return { ...file, path: filePath, sha256, fresh: { sizeBytes, head } };
}

async function prepareRelease({
  workspace,
  dataset,
  release,
  releaseIndex,
  listedByUrl,
  mustRead,
}: ReleasePreparation): Promise<PreparedRelease | null> {
  const fetchPage = timedFetch(workspace.scope.signal, PAGE_TIMEOUT_MS);
  const now = new Date();
  const checkedFiles = await Promise.all(
    release.files.map(async (file): Promise<CheckedFile> => {
      const head = isLocalFile(file) ? null : await headFile(fetchPage, file.url);
      const listed = listedByUrl.get(file.url);
      return { file, head, unchangedListing: isListedUnchanged(listed, file, release.publishedOn, head, now) ? listed : undefined };
    }),
  );
  if (!mustRead && checkedFiles.every(({ unchangedListing }) => unchangedListing !== undefined)) {
    for (const { file } of checkedFiles) logger.info("official.import.file_unchanged", describeFile(workspace, dataset, file));
    return null;
  }

  const files: ObtainedFile[] = [];
  for (const [fileIndex, checked] of checkedFiles.entries()) {
    const filePath = path.join(workspace.directory, `${dataset.key}-${releaseIndex}-${fileIndex}${path.extname(checked.file.fileName)}`);
    files.push(await obtainFile(workspace, dataset, checked, filePath));
  }

  return { dataset, release, files, sha256: releaseHashOf(files.map((file) => file.sha256)) };
}

export async function prepareReleases(reader: Reader, workspace: Workspace, dataset: RunDataset): Promise<PreparedRelease[]> {
  const { run } = workspace.scope;
  const described = { runId: run.id, datasetKey: dataset.key };
  logger.info("official.import.dataset_started", described);
  const discovery = readContextOf(workspace.scope, dataset.key, () => {
    throw new Error("A reader can skip records only while it parses a release");
  });
  const releases = await dataset.definition.discover(discovery);
  const urls = releases.flatMap((release) => release.files.map((file) => file.url));
  logger.info("official.import.discovered", { ...described, releases: releases.length, files: urls.length });
  assertReleasesAreDisjoint(dataset.key, releases);

  const key = { runId: run.id, datasetId: dataset.id };
  const checkpointedSlices = await readCheckpointedSlices(reader, key);
  const approvals = await readApprovals(reader, key);
  const listedByUrl = await readListedFiles(reader, run.sourceId, urls);

  const preparedReleases: PreparedRelease[] = [];
  for (const [releaseIndex, release] of releases.entries()) {
    if (release.coveredSlices.every((slice) => checkpointedSlices.has(slice))) continue;

    const mustRead = run.kind === "replay" || run.attempt > 1 || release.coveredSlices.some((slice) => approvals.has(slice));
    const prepared = await prepareRelease({ workspace, dataset, release, releaseIndex, listedByUrl, mustRead });
    if (prepared) preparedReleases.push(prepared);
  }

  return preparedReleases;
}
