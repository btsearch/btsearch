import { officialDatasets, officialLocations, officialSources, regions } from "@openbts/drizzle";
import { type SQL, type SQLWrapper, and, eq, exists, inArray, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import redis from "../../database/redis.js";
import { forgetRedisCache, withRedisStaleCache } from "../../lib/redisCache.js";
import { hasStaffPermission } from "../access/staff.js";
import { loadCountryVisibility, loadHiddenCountryCodes } from "../countries/visibility.js";

const datasetSelectSchema = createSelectSchema(officialDatasets);

export type OfficialVisibility = { sourceIds: number[] | null; hiddenCountryCodes: string[] };
type DatasetLayer = z.infer<typeof datasetSelectSchema>["layer"];
type SourceVisibility = { id: number; countryCode: string; shortName: string; isVisible: boolean; layers: DatasetLayer[] };

const SOURCE_VISIBILITY_CACHE_KEY = "official:v3:source-visibility";
const SOURCE_VISIBILITY_CACHE = { freshTtlSeconds: 60, staleTtlSeconds: 120 };

const publicLocation = alias(officialLocations, "public_location");
const hiddenRegion = alias(regions, "hidden_region");
const linkDataset = alias(officialDatasets, "link_dataset");

async function loadStoredSourceVisibility(): Promise<SourceVisibility[]> {
  return db
    .select({
      id: officialSources.id,
      countryCode: officialSources.countryCode,
      shortName: officialSources.shortName,
      isVisible: officialSources.isVisible,
      layers: sql<DatasetLayer[]>`COALESCE(array_agg(DISTINCT ${officialDatasets.layer}) FILTER (WHERE ${officialDatasets.layer} IS NOT NULL), '{}')`,
    })
    .from(officialSources)
    .leftJoin(officialDatasets, eq(officialDatasets.sourceId, officialSources.id))
    .groupBy(officialSources.id);
}

export async function loadSourceVisibility(): Promise<SourceVisibility[]> {
  if (!redis.isReady) return loadStoredSourceVisibility();

  const { value } = await withRedisStaleCache(SOURCE_VISIBILITY_CACHE_KEY, SOURCE_VISIBILITY_CACHE, loadStoredSourceVisibility);
  return value;
}

export function forgetSourceVisibility(): Promise<void> {
  return forgetRedisCache(SOURCE_VISIBILITY_CACHE_KEY);
}

function publicSourceIds(sources: readonly SourceVisibility[], hiddenCountryCodes: readonly string[]): number[] {
  return sources.filter((source) => source.isVisible && !hiddenCountryCodes.includes(source.countryCode)).map((source) => source.id);
}

export async function loadOfficialVisibility(req: FastifyRequest): Promise<OfficialVisibility> {
  const [hiddenCountryCodes, isStaff, sources] = await Promise.all([
    loadHiddenCountryCodes(req),
    hasStaffPermission(req, { official_import: ["read"] }),
    loadSourceVisibility(),
  ]);
  if (isStaff) return { sourceIds: null, hiddenCountryCodes };

  return { sourceIds: publicSourceIds(sources, hiddenCountryCodes), hiddenCountryCodes };
}

export async function loadPublicOfficialVisibility(): Promise<OfficialVisibility> {
  const [countries, sources] = await Promise.all([loadCountryVisibility(), loadSourceVisibility()]);
  const hiddenCountryCodes = countries.filter((country) => !country.isVisible).map((country) => country.code);

  return { sourceIds: publicSourceIds(sources, hiddenCountryCodes), hiddenCountryCodes };
}

export async function loadPublicSiteSourceNames(countryCode: string | null): Promise<string[]> {
  const [countries, sources] = await Promise.all([loadCountryVisibility(), loadSourceVisibility()]);
  if (countries.some((country) => country.code === countryCode && !country.isVisible)) return [];

  return sources
    .filter((source) => source.isVisible && source.countryCode === countryCode && source.layers.includes("sites"))
    .map((source) => source.shortName);
}

export function officialSourceIsPublic(sourceId: SQLWrapper, { sourceIds }: OfficialVisibility): SQL | undefined {
  return sourceIds === null ? undefined : inArray(sourceId, sourceIds);
}

function regionInVisibleCountry(regionId: SQLWrapper, hiddenCountryCodes: readonly string[]): SQL | undefined {
  if (hiddenCountryCodes.length === 0) return undefined;

  return notExists(
    db
      .select({ id: hiddenRegion.id })
      .from(hiddenRegion)
      .where(and(eq(hiddenRegion.id, regionId), inArray(hiddenRegion.countryCode, hiddenCountryCodes))),
  );
}

export function officialLocationIsPublic(locationId: SQLWrapper, visibility: OfficialVisibility): SQL | undefined {
  const isPublic = and(
    officialSourceIsPublic(publicLocation.source_id, visibility),
    regionInVisibleCountry(publicLocation.region_id, visibility.hiddenCountryCodes),
  );
  if (!isPublic) return undefined;

  return exists(
    db
      .select({ id: publicLocation.id })
      .from(publicLocation)
      .where(and(eq(publicLocation.id, locationId), isPublic)),
  );
}

export function microwaveLinkIsPublic(datasetId: SQLWrapper, visibility: OfficialVisibility): SQL | undefined {
  const fromPublicSource = officialSourceIsPublic(linkDataset.sourceId, visibility);
  if (!fromPublicSource) return undefined;

  return exists(
    db
      .select({ id: linkDataset.id })
      .from(linkDataset)
      .where(and(eq(linkDataset.id, datasetId), fromPublicSource)),
  );
}
