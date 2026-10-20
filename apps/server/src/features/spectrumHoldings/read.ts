import { bands, spectrumHoldings } from "@openbts/drizzle";
import type { Band, SpectrumHolding, SpectrumHoldingInclude } from "@openbts/shared/contract";
import { type SQL, and, gte, inArray, isNull, lte, or } from "drizzle-orm";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { unique } from "../../lib/collections.js";
import { toBand } from "../bands/serialize.js";
import { loadOperators } from "../operators/details.js";
import { type SpectrumHoldingRow, toSpectrumHolding } from "./serialize.js";

export function isActiveOn(day: string): SQL | undefined {
  return and(
    or(isNull(spectrumHoldings.validFrom), lte(spectrumHoldings.validFrom, day)),
    or(isNull(spectrumHoldings.validTo), gte(spectrumHoldings.validTo, day)),
  );
}

async function loadBands(bandIds: readonly number[]): Promise<Map<number, Band>> {
  if (bandIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(bands)
    .where(inArray(bands.id, [...bandIds]));
  return new Map(rows.map((row) => [row.id, toBand(row)]));
}

export async function serializeHoldings(
  rows: readonly SpectrumHoldingRow[],
  include: readonly SpectrumHoldingInclude[] = [],
): Promise<SpectrumHolding[]> {
  const includesOperator = include.includes("operator");
  const includesBand = include.includes("band");
  const [operatorsById, bandsById] = await Promise.all([
    loadOperators(db, includesOperator ? unique(rows.map((row) => row.operatorId)) : []),
    loadBands(includesBand ? unique(rows.map((row) => row.bandId)) : []),
  ]);

  return rows.map((row) => {
    const holding = toSpectrumHolding(row);
    if (includesOperator) holding.operator = operatorsById.get(row.operatorId);
    if (includesBand) holding.band = bandsById.get(row.bandId);
    return holding;
  });
}

export async function serializeHolding(row: SpectrumHoldingRow, include?: readonly SpectrumHoldingInclude[]): Promise<SpectrumHolding> {
  const [holding] = await serializeHoldings([row], include);
  if (!holding) throw new ErrorResponse("NOT_FOUND");
  return holding;
}
