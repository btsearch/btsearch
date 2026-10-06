import { bandsForChannel } from "@openbts/shared/bandCatalog";
import type { Band, CellRat, ObservedCell } from "@openbts/shared/contract";

import { getObservedChannel } from "./observed";
import type { AnalyzerLookups } from "./types";
import { getBandCode } from "@/features/station-details/station/utils/bands";

export const UNKNOWN_BAND_KEY = "unknown";

const CATALOG_RATS: Record<CellRat, string> = { gsm: "GSM", umts: "UMTS", lte: "LTE", nr: "NR" };
const NO_COUNTRY = "";
const bandIdsByLookups = new WeakMap<AnalyzerLookups, Map<string, number | null>>();

function findLogBandId(rat: CellRat, channel: number, countryCode: string | null, lookups: AnalyzerLookups): number | null {
  const catalogCodes = new Set(bandsForChannel(CATALOG_RATS[rat], channel).map((band) => band.code));
  if (catalogCodes.size === 0) return null;

  const candidates = lookups.bands.filter((band) => band.rat === rat && band.code !== null && catalogCodes.has(band.code));
  const plan = countryCode === null ? undefined : lookups.planBandIdsByCountry.get(countryCode);
  const planCandidates = plan === undefined ? [] : candidates.filter((band) => plan.has(band.id));
  const [only, ...others] = planCandidates.length > 0 ? planCandidates : candidates;
  return only !== undefined && others.length === 0 ? only.id : null;
}

export function resolveLogBandId(observed: ObservedCell, countryCode: string | null, lookups: AnalyzerLookups): number | null {
  const channel = getObservedChannel(observed);
  if (channel === null) return null;

  const knownBandIds = bandIdsByLookups.get(lookups) ?? new Map<string, number | null>();
  bandIdsByLookups.set(lookups, knownBandIds);

  const key = `${observed.rat}:${channel}:${countryCode ?? NO_COUNTRY}`;
  const known = knownBandIds.get(key);
  if (known !== undefined) return known;

  const bandId = findLogBandId(observed.rat, channel, countryCode, lookups);
  knownBandIds.set(key, bandId);
  return bandId;
}

export function getBandFacetKey(band: Band | undefined): string {
  if (band === undefined) return UNKNOWN_BAND_KEY;

  const code = getBandCode(band);
  if (code !== null) return code;
  return band.labelMhz === null ? UNKNOWN_BAND_KEY : `${band.rat}${band.labelMhz}`;
}

export function getBandFacetLabel(band: Band): string | null {
  return band.labelMhz === null ? null : String(band.labelMhz);
}
