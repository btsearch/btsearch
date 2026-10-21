import { officialLocations, officialPermits, officialSites, officialSources, regions } from "@openbts/drizzle";
import { BAND_VARIANTS } from "@openbts/shared/contract";
import type { OfficialBandLabel, OfficialBandLabelQuery } from "@openbts/shared/contract";
import { eq, isNotNull, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import redis from "../../database/redis.js";
import { withRedisStaleCache } from "../../lib/redisCache.js";
import { type OfficialPermitRow, toOfficialPermitLabel } from "./serialize.js";
import { type OfficialVisibility, loadOfficialVisibility } from "./visibility.js";

type LabelRat = NonNullable<OfficialPermitRow["rat"]>;
type LabelVariant = NonNullable<OfficialPermitRow["label_variant"]>;
type StoredBandLabel = {
  countryCode: string;
  sourceId: number;
  sourceKey: string;
  rat: LabelRat;
  labelMhz: number;
  variant: LabelVariant;
};

export const BAND_LABEL_CACHE_KEY = "official:v2:band-labels";
const BAND_LABEL_CACHE = { freshTtlSeconds: 600, staleTtlSeconds: 86_400 };
const NEWEST_TECHNOLOGIES_FIRST: readonly LabelRat[] = ["NR", "LTE", "UMTS", "CDMA", "GSM"];

function technologyRank(rat: LabelRat): number {
  const rank = NEWEST_TECHNOLOGIES_FIRST.indexOf(rat);
  return rank < 0 ? NEWEST_TECHNOLOGIES_FIRST.length : rank;
}

function compareBandLabels(a: StoredBandLabel, b: StoredBandLabel): number {
  return (
    technologyRank(a.rat) - technologyRank(b.rat) ||
    BAND_VARIANTS.indexOf(a.variant) - BAND_VARIANTS.indexOf(b.variant) ||
    a.labelMhz - b.labelMhz ||
    a.countryCode.localeCompare(b.countryCode) ||
    a.sourceKey.localeCompare(b.sourceKey)
  );
}

async function loadStoredBandLabels(): Promise<StoredBandLabel[]> {
  const rows = await db
    .selectDistinct({
      countryCode: regions.countryCode,
      sourceId: officialSources.id,
      sourceKey: officialSources.key,
      rat: sql<LabelRat>`${officialPermits.rat}`,
      labelMhz: sql<number>`${officialPermits.label_mhz}`,
      variant: sql<LabelVariant>`${officialPermits.label_variant}`,
    })
    .from(officialPermits)
    .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
    .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
    .innerJoin(regions, eq(regions.id, officialLocations.region_id))
    .innerJoin(officialSources, eq(officialSources.id, officialLocations.source_id))
    .where(isNotNull(officialPermits.label_mhz));
  return rows.sort(compareBandLabels);
}

async function cachedBandLabels(): Promise<StoredBandLabel[]> {
  if (!redis.isReady) return loadStoredBandLabels();

  const { value } = await withRedisStaleCache(BAND_LABEL_CACHE_KEY, BAND_LABEL_CACHE, loadStoredBandLabels);
  return value;
}

function isPublic(label: StoredBandLabel, { sourceIds, hiddenCountryCodes }: OfficialVisibility): boolean {
  return (sourceIds === null || sourceIds.includes(label.sourceId)) && !hiddenCountryCodes.includes(label.countryCode);
}

export async function loadOfficialBandLabels(
  req: FastifyRequest,
  { countryCodes, sourceKeys }: OfficialBandLabelQuery,
): Promise<OfficialBandLabel[]> {
  const [visibility, labels] = await Promise.all([loadOfficialVisibility(req), cachedBandLabels()]);

  return labels
    .filter((label) => isPublic(label, visibility))
    .filter((label) => (countryCodes?.includes(label.countryCode) ?? true) && (sourceKeys?.includes(label.sourceKey) ?? true))
    .map(({ countryCode, sourceKey, rat, labelMhz, variant }) => ({ countryCode, sourceKey, ...toOfficialPermitLabel(rat, labelMhz, variant) }));
}
