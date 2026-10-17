import { officialDatasetSlices, officialDatasets, officialSnapshots, officialSources } from "@openbts/drizzle";
import type { OfficialDataset, OfficialLayer, OfficialSource } from "@openbts/shared/contract";
import { type SQLWrapper, asc, eq, inArray } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { DEFAULT_HOLD_SHRINK_PERCENT } from "./import/config.js";

const sourceSelectSchema = createSelectSchema(officialSources);
const datasetSelectSchema = createSelectSchema(officialDatasets);

type SourceRow = z.infer<typeof sourceSelectSchema>;
type DatasetRow = z.infer<typeof datasetSelectSchema>;
type SliceRow = Awaited<ReturnType<typeof loadDatasetSlices>>[number];

const LAYERS = { sites: "sites", microwave_links: "microwaveLinks" } as const satisfies Record<DatasetRow["layer"], OfficialLayer>;

function latestImportedAt(slices: readonly SliceRow[]): Date | null {
  return slices.reduce<Date | null>(
    (latest, { importedAt }) => (importedAt !== null && (latest === null || importedAt > latest) ? importedAt : latest),
    null,
  );
}

export async function loadDatasetSlices(datasetIds: readonly number[] | SQLWrapper) {
  return db
    .select({
      datasetId: officialDatasetSlices.datasetId,
      key: officialDatasetSlices.key,
      importedAt: officialDatasetSlices.importedAt,
      releaseSha256: officialSnapshots.sha256,
    })
    .from(officialDatasetSlices)
    .leftJoin(officialSnapshots, eq(officialSnapshots.id, officialDatasetSlices.snapshotId))
    .where(inArray(officialDatasetSlices.datasetId, datasetIds))
    .orderBy(asc(officialDatasetSlices.datasetId), asc(officialDatasetSlices.key));
}

export function toOfficialDataset(row: DatasetRow, sourceKey: string, slices: readonly SliceRow[]): OfficialDataset {
  return {
    id: row.id,
    sourceKey,
    key: row.key,
    layer: LAYERS[row.layer],
    importedAt: latestImportedAt(slices)?.toISOString() ?? null,
    isEnabled: row.isEnabled,
    checkEveryHours: row.checkEveryHours,
    nextCheckAt: row.nextCheckAt?.toISOString() ?? null,
    holdShrinkPercent: row.holdShrinkPercent,
    defaultHoldShrinkPercent: DEFAULT_HOLD_SHRINK_PERCENT,
    slices: slices.map(({ key, importedAt, releaseSha256 }) => ({ key, importedAt: importedAt?.toISOString() ?? null, releaseSha256 })),
  };
}

function toOfficialSource(row: SourceRow, datasets: OfficialDataset[]): OfficialSource {
  return {
    key: row.key,
    countryCode: row.countryCode,
    shortName: row.shortName,
    authority: row.authority,
    homepageUrl: row.homepageUrl,
    license: row.licence,
    attribution: row.attribution,
    coverageNote: row.coverageNote,
    isVisible: row.isVisible,
    isEnabled: row.isEnabled,
    isRedistributable: row.isRedistributable,
    datasets,
  };
}

export async function loadOfficialSources(rows: readonly SourceRow[]): Promise<OfficialSource[]> {
  if (rows.length === 0) return [];

  const ofSources = inArray(
    officialDatasets.sourceId,
    rows.map((row) => row.id),
  );
  const [datasets, slices] = await Promise.all([
    db.select().from(officialDatasets).where(ofSources).orderBy(asc(officialDatasets.id)),
    loadDatasetSlices(db.select({ id: officialDatasets.id }).from(officialDatasets).where(ofSources)),
  ]);
  const datasetsBySource = Map.groupBy(datasets, (dataset) => dataset.sourceId);
  const slicesByDataset = Map.groupBy(slices, (slice) => slice.datasetId);

  return rows.map((row) => {
    const ownDatasets = datasetsBySource.get(row.id) ?? [];
    return toOfficialSource(
      row,
      ownDatasets.map((dataset) => toOfficialDataset(dataset, row.key, slicesByDataset.get(dataset.id) ?? [])),
    );
  });
}

export function toPublicOfficialSource(source: OfficialSource): OfficialSource {
  const { isEnabled: _isEnabled, isRedistributable: _isRedistributable, datasets, ...publicSource } = source;
  return { ...publicSource, datasets: datasets.map(({ id, sourceKey, key, layer, importedAt }) => ({ id, sourceKey, key, layer, importedAt })) };
}
