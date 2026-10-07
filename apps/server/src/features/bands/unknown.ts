import { bands, type cells } from "@openbts/drizzle";
import { type BandIdFilter, UNKNOWN_BAND } from "@openbts/shared/contract";
import { type SQL, eq, inArray, or, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import type { BandRow } from "./serialize.js";

export type BandSelection = { bandIds: number[]; includesUnknownBand: boolean };

const UNKNOWN_BAND_VALUE = 0;

export function isUnknownBand(band: Pick<BandRow, "value">): boolean {
  return band.value === UNKNOWN_BAND_VALUE;
}

export async function loadUnknownBandIds(): Promise<Set<number>> {
  const rows = await db.select({ id: bands.id }).from(bands).where(eq(bands.value, UNKNOWN_BAND_VALUE));
  return new Set(rows.map((row) => row.id));
}

export function splitBandFilter(filter: BandIdFilter | undefined): BandSelection {
  const entries = filter ?? [];
  return {
    bandIds: entries.filter((entry): entry is number => entry !== UNKNOWN_BAND),
    includesUnknownBand: entries.includes(UNKNOWN_BAND),
  };
}

export function bandCondition(bandId: typeof cells.band_id, { bandIds, includesUnknownBand }: BandSelection): SQL | undefined {
  return or(
    bandIds.length > 0 ? inArray(bandId, bandIds) : undefined,
    includesUnknownBand ? sql`${bandId} IN (SELECT ${bands.id} FROM ${bands} WHERE ${eq(bands.value, UNKNOWN_BAND_VALUE)})` : undefined,
  );
}
