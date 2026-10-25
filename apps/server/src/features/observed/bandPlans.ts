import { bands, countryBands } from "@openbts/drizzle";
import { type ChannelRange, channelKhz, channelRanges, resolveCatalogBand } from "@openbts/shared/bandCatalog";
import { eq, inArray } from "drizzle-orm";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import type { BandRow } from "../bands/serialize.js";
import { isUnknownBand } from "../bands/unknown.js";

type DatabaseRat = BandRow["rat"];

export type PlannedBand = { id: number; rat: DatabaseRat; ranges: ChannelRange[] };
type ChannelBand = { rat: DatabaseRat; firstChannel: number; lastChannel: number; bandId: number };

export async function loadBandPlans(countryCodes?: readonly string[]): Promise<Map<string, BandRow[]>> {
  if (countryCodes?.length === 0) return new Map();

  const rows = await db
    .select({ countryCode: countryBands.countryCode, band: bands })
    .from(countryBands)
    .innerJoin(bands, eq(bands.id, countryBands.bandId))
    .where(countryCodes ? inArray(countryBands.countryCode, [...countryCodes]) : undefined);
  return new Map([...Map.groupBy(rows, (row) => row.countryCode)].map(([countryCode, planned]) => [countryCode, planned.map((row) => row.band)]));
}

export function bandsHolding(rat: DatabaseRat, channel: number, candidates: readonly BandRow[]): BandRow[] {
  return candidates.filter((band) => {
    const catalog = band.rat === rat && !isUnknownBand(band) ? resolveCatalogBand(band) : null;
    return catalog !== null && channelKhz(catalog, channel) !== null;
  });
}

export function bandOfChannel(rat: DatabaseRat, channel: number, plan: readonly BandRow[]): number | null {
  const [only, ...others] = bandsHolding(rat, channel, plan);
  return only && others.length === 0 ? only.id : null;
}

export function toPlannedBand(band: BandRow): PlannedBand[] {
  const catalog = isUnknownBand(band) ? null : resolveCatalogBand(band);
  const ranges = catalog ? channelRanges(catalog) : [];
  return ranges.length > 0 ? [{ id: band.id, rat: band.rat, ranges }] : [];
}

export function channelBandIntervals(plan: readonly BandRow[]): ChannelBand[] {
  const spans = plan.flatMap(toPlannedBand).flatMap((band) => band.ranges.map(([first, last]) => ({ rat: band.rat, bandId: band.id, first, last })));
  return [...Map.groupBy(spans, (span) => span.rat)].flatMap(([rat, ratSpans]) => {
    const edges = unique(ratSpans.flatMap((span) => [span.first, span.last + 1])).toSorted((a, b) => a - b);
    return edges.slice(0, -1).flatMap((firstChannel, index): ChannelBand[] => {
      const lastChannel = edges[index + 1]! - 1;
      const holders = unique(ratSpans.filter((span) => span.first <= firstChannel && span.last >= lastChannel).map((span) => span.bandId));
      return holders.length === 1 ? [{ rat, firstChannel, lastChannel, bandId: holders[0]! }] : [];
    });
  });
}
