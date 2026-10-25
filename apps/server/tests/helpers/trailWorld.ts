import { bands, cellBins, cellCopies, contributors, countryBands, personTrailBins, trailLevels, trailSquares } from "@openbts/drizzle";
import { and, eq } from "drizzle-orm";

import { type Point, quadkeyOf, tileAt } from "../../src/features/observed/tiles/squares.js";
import type { DbTx } from "../../src/types/global.js";
import { added } from "./crowdWorld.js";

type Rat = "GSM" | "UMTS" | "LTE" | "NR";
type CatalogBand = { rat: Rat; value: number; duplex: "FDD" | "TDD"; code: string };
type TrailSquare = {
  plmn: string;
  rat?: Rat;
  channel: number;
  zoom?: number;
  bin: number;
  held?: boolean;
  lastSeenOn?: string;
  levels: Partial<Record<number, number>>;
};
type CellBin = {
  observedCellId: number;
  bin: number;
  samples: number;
  servingSamples?: number;
  levelDbm: number;
  sinrDb?: number | null;
  stationarySamples?: number;
  lastSeenOn?: string;
};

const WEIGHT_PER_SAMPLE = 1000;
const ONE_PERSON = 1n;

export const LTE_1800: CatalogBand = { rat: "LTE", value: 1800, duplex: "FDD", code: "B3" };
export const LTE_800: CatalogBand = { rat: "LTE", value: 800, duplex: "FDD", code: "B20" };

export function squareAt(point: Point, zoom = 20): number {
  return quadkeyOf(tileAt(point, zoom));
}

export async function addPlannedBand(tx: DbTx, countryCode: string, { rat, value, duplex, code }: CatalogBand): Promise<number> {
  const [existing] = await tx
    .select({ id: bands.id })
    .from(bands)
    .where(and(eq(bands.code, code), eq(bands.variant, "commercial")))
    .limit(1);
  const bandId =
    existing?.id ??
    added(
      await tx
        .insert(bands)
        .values({ rat, value, duplex, code, name: `Crowd test ${code}` })
        .returning({ id: bands.id }),
      "The band",
    ).id;
  await tx.insert(countryBands).values({ countryCode, bandId }).onConflictDoNothing();
  return bandId;
}

export async function addTrailSquare(
  tx: DbTx,
  { plmn, rat = "LTE", channel, zoom = 20, bin, held = false, lastSeenOn = "2099-01-12", levels }: TrailSquare,
): Promise<void> {
  await tx.insert(trailSquares).values({ plmn, rat, channel, zoom, bin, held, contributorBits: ONE_PERSON, lastSeenOn });
  const rows = Object.entries(levels).map(([bucket, sampleCount = 0]) => ({
    plmn,
    rat,
    channel,
    zoom,
    bin,
    held,
    levelBucket: Number(bucket),
    sampleCount,
  }));
  if (rows.length > 0) await tx.insert(trailLevels).values(rows);
}

export async function addContributor(tx: DbTx, userId: string): Promise<void> {
  await tx.insert(contributors).values({ userId }).onConflictDoNothing();
}

export async function addPersonTrailBin(
  tx: DbTx,
  {
    userId,
    plmn,
    rat = "LTE",
    bin,
    samples,
    lastSeenOn = "2099-01-12",
  }: { userId: string; plmn: string; rat?: Rat; bin: number; samples: number; lastSeenOn?: string },
): Promise<void> {
  await addContributor(tx, userId);
  await tx.insert(personTrailBins).values({ userId, plmn, rat, bin, sampleCount: samples, lastSeenOn });
}

export async function addCellBin(
  tx: DbTx,
  { observedCellId, bin, samples, servingSamples = samples, levelDbm, sinrDb = null, stationarySamples = 0, lastSeenOn = "2099-01-12" }: CellBin,
): Promise<void> {
  const weight = BigInt(samples * WEIGHT_PER_SAMPLE);
  const levelCenti = BigInt(levelDbm * 100);
  const sinrCenti = sinrDb === null ? 0n : BigInt(sinrDb * 100);
  const sinrWeight = sinrDb === null ? 0n : weight;
  await tx.insert(cellBins).values({
    observedCellId,
    bin,
    sampleCount: samples,
    weightMilli: weight,
    servingWeightMilli: BigInt(servingSamples * WEIGHT_PER_SAMPLE),
    levelWsum: weight * levelCenti,
    levelWsq: weight * levelCenti * levelCenti,
    qualityWeightMilli: 0n,
    qualityWsum: 0n,
    sinrWeightMilli: sinrWeight,
    sinrWsum: sinrWeight * sinrCenti,
    sinrWsq: sinrWeight * sinrCenti * sinrCenti,
    offsetXWsum: 0n,
    offsetYWsum: 0n,
    stationaryCount: stationarySamples,
    contributorBits: ONE_PERSON,
    firstSeenOn: lastSeenOn,
    lastSeenOn,
  });
}

export async function addCellCopy(tx: DbTx, observedCellId: number, primaryCellId: number): Promise<void> {
  await tx.insert(cellCopies).values({ observedCellId, primaryCellId, basis: "broadcastList" });
}
