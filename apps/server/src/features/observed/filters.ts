import { cellCopies, cellMatches, cellNetworks, cells, observedCellSummaries, observedCellValues, observedCells, operators } from "@openbts/drizzle";
import type { ChannelRange } from "@openbts/shared/bandCatalog";
import type { BandIdFilter, CellRat } from "@openbts/shared/contract";
import { type SQL, and, between, eq, exists, gte, inArray, not, notExists, notInArray, or, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { loadUnknownBandIds, splitBandFilter } from "../bands/unknown.js";
import { DATABASE_RATS } from "../stations/serialize.js";
import { type PlannedBand, loadBandPlans, toPlannedBand } from "./bandPlans.js";
import { namedByTwoPeople } from "./cells/confirmation.js";
import { findOperatorCodes, selectReportedCodes } from "./networks.js";

type CountryPlan = { networkCodes: string[]; bands: PlannedBand[] };
type BandFilter = { bandIds: number[]; includesUnknownBand: boolean; unknownBandIds: number[]; wanted: CountryPlan[]; planned: CountryPlan[] };

type ObservedCellFilterQuery = {
  operatorIds?: number[];
  rats?: CellRat[];
  bandIds?: BandIdFilter;
  lastSeenAfter?: string;
  includeCopies?: boolean;
};
export type ObservedCellFilters = Omit<ObservedCellFilterQuery, "operatorIds" | "bandIds"> & {
  operatorCodes: string[] | null;
  bands: BandFilter | null;
};

export function namesNetwork(codes: readonly string[]): SQL {
  const listed = db
    .select({ id: cellNetworks.observedCellId })
    .from(cellNetworks)
    .where(
      and(eq(cellNetworks.observedCellId, observedCells.id), inArray(cellNetworks.plmn, [...codes]), namedByTwoPeople(cellNetworks.contributorBits)),
    );
  return sql`(${inArray(observedCells.plmn, [...codes])} OR ${exists(listed)})`;
}

function selectCodeCountries() {
  const reported = selectReportedCodes();
  return db
    .select({ code: reported.reportedCode, countryCode: operators.countryCode })
    .from(reported)
    .innerJoin(operators, eq(operators.id, reported.operatorId));
}

async function resolveBandFilter(bandIds: BandIdFilter): Promise<BandFilter> {
  const selection = splitBandFilter(bandIds);
  const [plans, networks, unknownBandIds] = await Promise.all([loadBandPlans(), selectCodeCountries(), loadUnknownBandIds()]);
  const networksByCountry = Map.groupBy(networks, (network) => network.countryCode);
  const planned = [...plans].map(([countryCode, plan]) => ({
    networkCodes: (networksByCountry.get(countryCode) ?? []).map((network) => network.code),
    bands: plan.flatMap(toPlannedBand),
  }));
  const wanted = planned.map((plan) => ({ ...plan, bands: plan.bands.filter((band) => selection.bandIds.includes(band.id)) }));
  return { ...selection, unknownBandIds: [...unknownBandIds], wanted, planned };
}

function confirmedChannelIn(ranges: readonly ChannelRange[]): SQL {
  const values = db
    .select({ id: observedCellValues.observedCellId })
    .from(observedCellValues)
    .where(
      and(
        eq(observedCellValues.observedCellId, observedCells.id),
        eq(observedCellValues.field, "channel"),
        namedByTwoPeople(observedCellValues.contributorBits),
        or(...ranges.map(([first, last]) => between(observedCellValues.value, first, last))),
      ),
    );
  return exists(values);
}

function channelInPlan(plans: readonly CountryPlan[]): SQL {
  const inCountries = plans.flatMap((plan) => {
    const rangesByRat = [...Map.groupBy(plan.bands, (band) => band.rat)].map(([rat, ratBands]) => ({
      rat,
      ranges: ratBands.flatMap((band) => band.ranges),
    }));
    const byRat = rangesByRat.map(({ rat, ranges }) => and(eq(observedCells.rat, rat), confirmedChannelIn(ranges)));
    return plan.networkCodes.length > 0 && byRat.length > 0 ? [and(inArray(observedCells.plmn, plan.networkCodes), or(...byRat))] : [];
  });
  return or(...inCountries) ?? sql`false`;
}

function matchedCellOnBand(unknownBandIds: readonly number[], bandIds?: readonly number[]): SQL {
  const matched = db
    .select({ id: cellMatches.observedCellId })
    .from(cellMatches)
    .innerJoin(cells, eq(cells.id, cellMatches.cellId))
    .where(
      and(
        eq(cellMatches.observedCellId, observedCells.id),
        notInArray(cells.band_id, [...unknownBandIds]),
        bandIds ? inArray(cells.band_id, [...bandIds]) : undefined,
      ),
    );
  return exists(matched);
}

function bandCondition(filter: BandFilter): SQL {
  const onKnownBand = matchedCellOnBand(filter.unknownBandIds);
  const onWantedBand =
    filter.bandIds.length > 0
      ? or(matchedCellOnBand(filter.unknownBandIds, filter.bandIds), and(not(onKnownBand), channelInPlan(filter.wanted)))
      : undefined;
  const onNoBand = filter.includesUnknownBand ? and(not(onKnownBand), not(channelInPlan(filter.planned))) : undefined;
  return or(onWantedBand, onNoBand) ?? sql`false`;
}

export async function resolveObservedCellFilters(query: ObservedCellFilterQuery): Promise<ObservedCellFilters> {
  const [operatorCodes, bandFilter] = await Promise.all([
    query.operatorIds ? findOperatorCodes(query.operatorIds) : null,
    query.bandIds ? resolveBandFilter(query.bandIds) : null,
  ]);
  return { rats: query.rats, lastSeenAfter: query.lastSeenAfter, includeCopies: query.includeCopies, operatorCodes, bands: bandFilter };
}

export function observedCellConditions(filters: ObservedCellFilters): SQL[] {
  const conditions: SQL[] = [];
  const rats = filters.rats?.map((rat) => DATABASE_RATS[rat]);

  if (filters.operatorCodes) conditions.push(namesNetwork(filters.operatorCodes));
  if (rats) conditions.push(inArray(observedCells.rat, rats));
  if (filters.bands) conditions.push(bandCondition(filters.bands));
  if (filters.lastSeenAfter) {
    const seen = db
      .select({ id: observedCellSummaries.observedCellId })
      .from(observedCellSummaries)
      .where(and(eq(observedCellSummaries.observedCellId, observedCells.id), gte(observedCellSummaries.lastSeenOn, filters.lastSeenAfter)));
    conditions.push(exists(seen));
  }
  if (filters.includeCopies !== true) {
    const copies = db.select({ id: cellCopies.observedCellId }).from(cellCopies).where(eq(cellCopies.observedCellId, observedCells.id));
    conditions.push(notExists(copies));
  }
  return conditions;
}
