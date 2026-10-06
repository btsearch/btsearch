import type { EmfInactiveSiteList, EmfInactiveSiteListQuery } from "@openbts/shared/contract";
import { type SI2PEMExtendedBaseStationProperties, SI2PEM_WFS_FEATURE_TYPES } from "si2pem-reader";

import { withRedisStaleCache } from "../../lib/redisCache.js";
import { ENTITY_TO_MNC } from "../pem/entities.js";
import { si2pemDateToWarsawDay } from "../pem/si2pemValues.js";
import { getVoivodeshipByTeryt } from "../pem/voivodeships.js";
import { type SiteRow, createSiteMatcher, resolveWindow, toPaging, withSiteRefs } from "./lists.js";
import { si2pem } from "./si2pem.js";

type InactiveSiteRow = SiteRow & { siteId: string; disabledOn: string | null };
type InactiveSiteProperties = SI2PEMExtendedBaseStationProperties & {
  identity_names?: string | null;
  bs_identity_name?: string | null;
  location_in_city?: string | null;
  installation_operator_name?: string | null;
  operator?: string | null;
};

const LIST_CACHE = { freshTtlSeconds: 86400, staleTtlSeconds: 7 * 86400 };
const LIST_CACHE_KEY = "emf:inactive-sites:v1";
const LIST_MAX_BYTES = 64 * 1024 * 1024;
const HELD_IN_MEMORY_MS = 5 * 60_000;

let held: { rows: InactiveSiteRow[]; until: number } | null = null;

function newestFirst(a: InactiveSiteRow, b: InactiveSiteRow): number {
  return (b.disabledOn ?? "").localeCompare(a.disabledOn ?? "") || a.siteId.localeCompare(b.siteId);
}

async function fetchInactiveSites(): Promise<InactiveSiteRow[]> {
  const json = await si2pem.getFeatures(
    { typeName: SI2PEM_WFS_FEATURE_TYPES.extendedBaseStations, cqlFilter: "is_old=true AND is_active=false" },
    { maxJsonBytes: LIST_MAX_BYTES },
  );

  const seen = new Set<string>();
  const rows = (json.features ?? []).flatMap<InactiveSiteRow>(({ geometry, properties: known }) => {
    const properties: InactiveSiteProperties = known;
    const siteId = (properties.identity_name ?? properties.identity_names ?? properties.bs_identity_name)?.trim() || null;
    if (!geometry || siteId === null || seen.has(siteId) || !properties.is_old || properties.is_active) return [];

    const [longitude, latitude] = geometry.coordinates;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return [];

    seen.add(siteId);
    return [
      {
        siteId,
        mnc: ENTITY_TO_MNC[properties.installation_operator_name ?? properties.operator_name ?? properties.operator ?? ""] ?? null,
        regionName: getVoivodeshipByTeryt(properties.teryt),
        latitude,
        longitude,
        city: properties.city?.trim() || null,
        address: (properties.location_in_city ?? properties.address)?.trim() || null,
        disabledOn: si2pemDateToWarsawDay(properties.disabling_date),
      },
    ];
  });

  return rows.sort(newestFirst);
}

async function allInactiveSites(): Promise<InactiveSiteRow[]> {
  if (held !== null && held.until > Date.now()) return held.rows;

  const { value } = await withRedisStaleCache(LIST_CACHE_KEY, LIST_CACHE, fetchInactiveSites);
  held = { rows: value, until: Date.now() + HELD_IN_MEMORY_MS };
  return value;
}

export async function listEmfInactiveSites(query: EmfInactiveSiteListQuery): Promise<EmfInactiveSiteList> {
  const window = resolveWindow(query);
  const [sites, matchesQuery] = await Promise.all([allInactiveSites(), createSiteMatcher(query)]);
  const rows = sites.filter(matchesQuery);
  const page = rows.slice(window.offset, window.offset + window.limit);

  return {
    data: (await withSiteRefs(page, query.include)).map(({ row, refs }) => ({ ...refs, disabledOn: row.disabledOn })),
    paging: toPaging(window, rows.length, query.includeTotal),
  };
}
