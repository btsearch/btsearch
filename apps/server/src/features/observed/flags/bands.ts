import { bands, cellCopies, countryBands, observationFlags, observedCellValues, observedCells } from "@openbts/drizzle";
import { resolveCatalogBand } from "@openbts/shared/bandCatalog";
import { and, eq, exists, gte, max, notExists, sql } from "drizzle-orm";

import db from "../../../database/psql.js";
import { unique } from "../../../lib/collections.js";
import type { BandRow } from "../../bands/serialize.js";
import { CONTRACT_RATS } from "../../stations/serialize.js";
import { bandsHolding, loadBandPlans } from "../bandPlans.js";
import { countPeople, namedByTwoPeople } from "../cells/confirmation.js";
import { type Network, loadNetworks } from "../networks.js";
import { daysAgo } from "./dates.js";
import type { RaisedFlag } from "./kinds.js";
import { countryBandSubject } from "./subjects.js";
import { type FlagSyncCounts, syncFlags } from "./sync.js";

const SEEN_WITHIN_DAYS = 90;

export type ChannelSighting = { plmn: string; rat: BandRow["rat"]; channel: number; samples: number; contributorBits: bigint; lastSeenOn: string };
export type BandFlagInput = {
  channels: readonly ChannelSighting[];
  networks: ReadonlyMap<string, Network>;
  plans: ReadonlyMap<string, readonly BandRow[]>;
  bands: readonly BandRow[];
};

type FoundBand = { countryCode: string; band: BandRow; sightings: ChannelSighting[] };

function widthOf(band: BandRow): number {
  const range = resolveCatalogBand(band)?.downlinkKhz;
  return range ? range[1] - range[0] : Number.POSITIVE_INFINITY;
}

export function narrowestBand(candidates: readonly BandRow[]): BandRow | undefined {
  return candidates.toSorted((a, b) => widthOf(a) - widthOf(b) || a.id - b.id)[0];
}

export function raiseBandFlags({ channels, networks, plans, bands: catalogued }: BandFlagInput): RaisedFlag<"bandNotInPlan">[] {
  const found = new Map<string, FoundBand>();
  for (const sighting of channels) {
    const network = networks.get(sighting.plmn);
    if (network === undefined || bandsHolding(sighting.rat, sighting.channel, plans.get(network.countryCode) ?? []).length > 0) continue;
    const band = narrowestBand(bandsHolding(sighting.rat, sighting.channel, catalogued));
    if (band === undefined) continue;

    const subjectKey = countryBandSubject(network.countryCode, band.id);
    const entry = found.get(subjectKey) ?? { countryCode: network.countryCode, band, sightings: [] };
    entry.sightings.push(sighting);
    found.set(subjectKey, entry);
  }

  return [...found].flatMap(([subjectKey, { countryCode, band, sightings }]): RaisedFlag<"bandNotInPlan">[] => {
    const rat = CONTRACT_RATS[band.rat];
    if (rat === undefined) return [];
    const channels = unique(sightings.map((sighting) => sighting.channel)).toSorted((a, b) => a - b);
    const people = countPeople(sightings.reduce((bits, sighting) => bits | sighting.contributorBits, 0n));
    return [
      {
        kind: "bandNotInPlan",
        subjectKey,
        refs: { countryCode, bandId: band.id },
        evidence: {
          rat,
          channels,
          samples: sightings.reduce((total, sighting) => total + sighting.samples, 0),
          people,
          lastSeenOn: sightings.reduce((latest, sighting) => (sighting.lastSeenOn > latest ? sighting.lastSeenOn : latest), ""),
        },
        suggestion: { bandId: band.id },
        measure: { channels, people },
      },
    ];
  });
}

async function loadChannelSightings(): Promise<ChannelSighting[]> {
  const seenSince = daysAgo(SEEN_WITHIN_DAYS);
  const isCopy = db.select({ id: cellCopies.observedCellId }).from(cellCopies).where(eq(cellCopies.observedCellId, observedCells.id));
  const rows = await db
    .select({
      plmn: observedCells.plmn,
      rat: observedCells.rat,
      channel: observedCellValues.value,
      samples: sql<number>`sum(${observedCellValues.sampleCount})`.mapWith(Number),
      contributorBits: sql<bigint>`bit_or(${observedCellValues.contributorBits})`.mapWith(BigInt),
      lastSeenOn: max(observedCellValues.lastSeenOn),
    })
    .from(observedCellValues)
    .innerJoin(observedCells, eq(observedCells.id, observedCellValues.observedCellId))
    .where(
      and(
        eq(observedCellValues.field, "channel"),
        gte(observedCellValues.lastSeenOn, seenSince),
        namedByTwoPeople(observedCellValues.contributorBits),
        notExists(isCopy),
      ),
    )
    .groupBy(observedCells.plmn, observedCells.rat, observedCellValues.value);
  return rows.flatMap(({ lastSeenOn, ...row }) => (lastSeenOn === null ? [] : [{ ...row, lastSeenOn }]));
}

function isInPlan() {
  const inPlan = db
    .select({ bandId: countryBands.bandId })
    .from(countryBands)
    .where(and(eq(countryBands.countryCode, observationFlags.countryCode), eq(countryBands.bandId, observationFlags.bandId)));
  return exists(inPlan);
}

export async function syncBandFlags(): Promise<FlagSyncCounts> {
  const [channels, catalogued] = await Promise.all([loadChannelSightings(), db.select().from(bands)]);
  const networks = await loadNetworks(unique(channels.map((sighting) => sighting.plmn)));
  const plans = await loadBandPlans(unique([...networks.values()].map((network) => network.countryCode)));
  const raised = raiseBandFlags({ channels, networks, plans, bands: catalogued });
  return db.transaction((tx) => syncFlags(tx, { kinds: ["bandNotInPlan"], raised, fixed: isInPlan() }));
}

export async function resolveBandFlags(): Promise<FlagSyncCounts> {
  return db.transaction((tx) => syncFlags(tx, { kinds: ["bandNotInPlan"], lookedAt: isInPlan(), raised: [], fixed: isInPlan() }));
}
