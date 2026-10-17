/* eslint-disable no-await-in-loop */
import type { OfficialSourceDefinition } from "@openbts/country-packs/sources";
import { officialDatasets, officialSources } from "@openbts/drizzle";
import { eq, sql } from "drizzle-orm";

import db from "../../../database/psql.js";
import type { DbTx } from "../../../types/global.js";
import { forgetSourceVisibility } from "../visibility.js";
import { correctLicenseeNames } from "./licensees.js";

type SourceSyncResult = { addedSources: string[]; addedDatasets: string[]; licenseeNamesCorrected: number };

const DESCRIPTIVE_FIELDS = ["countryCode", "shortName", "authority", "homepageUrl", "licence", "attribution", "isRedistributable"] as const;

function descriptionOf(source: OfficialSourceDefinition): Pick<OfficialSourceDefinition, (typeof DESCRIPTIVE_FIELDS)[number]> {
  return {
    countryCode: source.countryCode,
    shortName: source.shortName,
    authority: source.authority,
    homepageUrl: source.homepageUrl,
    licence: source.licence,
    attribution: source.attribution,
    isRedistributable: source.isRedistributable,
  };
}

async function syncSourceRow(tx: DbTx, source: OfficialSourceDefinition): Promise<{ id: number; isNew: boolean }> {
  const description = descriptionOf(source);
  const [stored] = await tx.select().from(officialSources).where(eq(officialSources.key, source.key)).limit(1);
  if (!stored) {
    const [added] = await tx
      .insert(officialSources)
      .values({ key: source.key, ...description, isEnabled: false, isVisible: false })
      .returning({ id: officialSources.id });
    if (!added) throw new Error(`Failed to add the source ${source.key}`);
    return { id: added.id, isNew: true };
  }

  if (DESCRIPTIVE_FIELDS.some((field) => stored[field] !== description[field])) {
    await tx
      .update(officialSources)
      .set({ ...description, updatedAt: sql`now()` })
      .where(eq(officialSources.id, stored.id));
  }
  return { id: stored.id, isNew: false };
}

async function addMissingDatasets(tx: DbTx, sourceId: number, source: OfficialSourceDefinition): Promise<string[]> {
  const stored = await tx.select({ key: officialDatasets.key }).from(officialDatasets).where(eq(officialDatasets.sourceId, sourceId));
  const missing = source.datasets.filter((dataset) => !stored.some(({ key }) => key === dataset.key));
  if (missing.length === 0) return [];

  await tx
    .insert(officialDatasets)
    .values(missing.map(({ key, layer, checkEveryHours }) => ({ sourceId, key, layer, checkEveryHours, isEnabled: false })));
  return missing.map((dataset) => `${source.key}/${dataset.key}`);
}

export async function syncSources(sources: readonly OfficialSourceDefinition[]): Promise<SourceSyncResult> {
  const synced = await db.transaction(async (tx) => {
    const result: SourceSyncResult = { addedSources: [], addedDatasets: [], licenseeNamesCorrected: 0 };
    for (const source of sources) {
      const { id, isNew } = await syncSourceRow(tx, source);
      if (isNew) result.addedSources.push(source.key);
      result.addedDatasets.push(...(await addMissingDatasets(tx, id, source)));
      result.licenseeNamesCorrected += await correctLicenseeNames(tx, id, source.shortLicenseeName);
    }

    return result;
  });
  await forgetSourceVisibility();
  return synced;
}
