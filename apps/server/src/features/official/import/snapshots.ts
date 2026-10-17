import {
  officialDatasetSlices,
  officialFiles,
  officialListedFiles,
  officialSnapshotFiles,
  officialSnapshotSlices,
  officialSnapshots,
} from "@openbts/drizzle";
import { and, eq, inArray, sql } from "drizzle-orm";

import { chunks } from "../../../lib/collections.js";
import type { DbTx } from "../../../types/global.js";
import { mediaTypeOf } from "./archive.js";
import { STATEMENT_BATCH_SIZE } from "./config.js";
import type { ListedFile } from "./download.js";
import type { ObtainedFile, PreparedRelease } from "./types.js";

export async function readListedFiles(reader: Pick<DbTx, "select">, sourceId: number, urls: readonly string[]): Promise<Map<string, ListedFile>> {
  const listedByUrl = new Map<string, ListedFile>();
  for (const group of chunks(urls, STATEMENT_BATCH_SIZE)) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await reader
      .select()
      .from(officialListedFiles)
      .where(and(eq(officialListedFiles.sourceId, sourceId), inArray(officialListedFiles.url, group)));
    for (const row of rows) listedByUrl.set(row.url, row);
  }

  return listedByUrl;
}

async function addMissingFiles(tx: DbTx, files: readonly ObtainedFile[]): Promise<void> {
  const freshFiles = new Map(
    files.flatMap((file) =>
      file.fresh ? [[file.sha256, { sha256: file.sha256, sizeBytes: file.fresh.sizeBytes, mediaType: mediaTypeOf(file.fileName) }] as const] : [],
    ),
  );
  if (freshFiles.size === 0) return;

  const stored = await tx
    .select({ sha256: officialFiles.sha256 })
    .from(officialFiles)
    .where(inArray(officialFiles.sha256, [...freshFiles.keys()]));
  for (const { sha256 } of stored) freshFiles.delete(sha256);
  if (freshFiles.size > 0) await tx.insert(officialFiles).values([...freshFiles.values()]);
}

async function findOrAddSnapshot(tx: DbTx, sha256: string, fileHashes: readonly string[]): Promise<number> {
  const [stored] = await tx.select({ id: officialSnapshots.id }).from(officialSnapshots).where(eq(officialSnapshots.sha256, sha256)).limit(1);
  if (stored) return stored.id;

  const [added] = await tx
    .insert(officialSnapshots)
    .values({ sha256, fetchedAt: sql`now()` })
    .returning({ id: officialSnapshots.id });
  if (!added) throw new Error("Failed to record the release");

  await tx.insert(officialSnapshotFiles).values(fileHashes.map((fileSha256, position) => ({ snapshotId: added.id, position, fileSha256 })));
  return added.id;
}

async function addMissingSlices(tx: DbTx, snapshotId: number, datasetId: number, slices: readonly string[]): Promise<void> {
  const known = await tx
    .select({ key: officialDatasetSlices.key })
    .from(officialDatasetSlices)
    .where(and(eq(officialDatasetSlices.datasetId, datasetId), inArray(officialDatasetSlices.key, [...slices])));
  const unknown = slices.filter((slice) => !known.some(({ key }) => key === slice));
  if (unknown.length > 0) await tx.insert(officialDatasetSlices).values(unknown.map((key) => ({ datasetId, key })));

  const covered = await tx
    .select({ slice: officialSnapshotSlices.slice })
    .from(officialSnapshotSlices)
    .where(and(eq(officialSnapshotSlices.snapshotId, snapshotId), eq(officialSnapshotSlices.datasetId, datasetId)));
  const uncovered = slices.filter((slice) => !covered.some((row) => row.slice === slice));
  if (uncovered.length > 0) await tx.insert(officialSnapshotSlices).values(uncovered.map((slice) => ({ snapshotId, datasetId, slice })));
}

async function saveListedFiles(tx: DbTx, sourceId: number, prepared: PreparedRelease): Promise<void> {
  const listings = prepared.files.flatMap((file) =>
    file.fresh
      ? [
          {
            sourceId,
            url: file.url,
            fileName: file.fileName,
            sizeBytes: file.fresh.head?.sizeBytes ?? null,
            publishedOn: prepared.release.publishedOn,
            etag: file.fresh.head?.etag ?? null,
            lastModified: file.fresh.head?.lastModified ?? null,
            fileSha256: file.sha256,
            checkedAt: sql`now()`,
          },
        ]
      : [],
  );
  if (listings.length === 0) return;

  await tx
    .insert(officialListedFiles)
    .values(listings)
    .onConflictDoUpdate({
      target: [officialListedFiles.sourceId, officialListedFiles.url],
      set: {
        fileName: sql`excluded.file_name`,
        sizeBytes: sql`excluded.size_bytes`,
        publishedOn: sql`excluded.published_on`,
        etag: sql`excluded.etag`,
        lastModified: sql`excluded.last_modified`,
        fileSha256: sql`excluded.file_sha256`,
        checkedAt: sql`excluded.checked_at`,
      },
    });
}

export async function recordRelease(tx: DbTx, sourceId: number, prepared: PreparedRelease): Promise<number> {
  await addMissingFiles(tx, prepared.files);
  const snapshotId = await findOrAddSnapshot(
    tx,
    prepared.sha256,
    prepared.files.map((file) => file.sha256),
  );
  await addMissingSlices(tx, snapshotId, prepared.dataset.id, prepared.release.coveredSlices);
  await saveListedFiles(tx, sourceId, prepared);

  return snapshotId;
}
