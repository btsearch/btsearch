import { contributorMonths, observedCells, uploadDrops, uploadFolds, uploadNewSquares, uploads } from "@openbts/drizzle";
import type { MeasurementSummary } from "@openbts/shared/contract";
import { type SQLWrapper, count, eq, inArray, max, min, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import { findRanks } from "../stats/leaderboards.js";
import { loadObservationCountryCodes } from "../stats/observations.js";
import { countSitesFoundFirst, selectCountedUploadIds } from "./uploads/counting.js";

function total(value: SQLWrapper) {
  return sql<number>`coalesce(sum(${value}), 0)`.mapWith(Number);
}

export async function findSummary(userId: string): Promise<MeasurementSummary> {
  const counted = selectCountedUploadIds(userId);
  const [[folded], [dropped], [cells], sites, squares, months, ranks] = await Promise.all([
    db
      .select({
        uploads: count(),
        samples: total(uploadFolds.sampleCount),
        firstUploadAt: min(uploads.receivedAt),
        lastUploadAt: max(uploads.receivedAt),
      })
      .from(uploadFolds)
      .innerJoin(uploads, eq(uploads.id, uploadFolds.uploadId))
      .where(inArray(uploadFolds.uploadId, counted)),
    db
      .select({ samples: total(uploadDrops.sampleCount) })
      .from(uploadDrops)
      .where(inArray(uploadDrops.uploadId, counted)),
    db.select({ cells: count() }).from(observedCells).where(inArray(observedCells.firstUploadId, counted)),
    countSitesFoundFirst(counted),
    db
      .select({ countryCode: uploadNewSquares.countryCode, newSquares: total(uploadNewSquares.squareCount) })
      .from(uploadNewSquares)
      .where(inArray(uploadNewSquares.uploadId, counted))
      .groupBy(uploadNewSquares.countryCode),
    db
      .select({ countryCode: contributorMonths.countryCode, samples: total(contributorMonths.sampleCount) })
      .from(contributorMonths)
      .where(eq(contributorMonths.userId, userId))
      .groupBy(contributorMonths.countryCode),
    loadObservationCountryCodes().then((countryCodes) => findRanks(userId, countryCodes)),
  ]);

  const newSquaresByCountry = new Map(squares.map((row) => [row.countryCode, row.newSquares]));
  const samplesByCountry = new Map(months.map((row) => [row.countryCode, row.samples]));
  const countries = unique([...newSquaresByCountry.keys(), ...samplesByCountry.keys()])
    .map((countryCode) => ({ countryCode, samples: samplesByCountry.get(countryCode) ?? 0, newSquares: newSquaresByCountry.get(countryCode) ?? 0 }))
    .filter((country) => country.samples > 0 || country.newSquares > 0)
    .toSorted((a, b) => b.samples - a.samples || a.countryCode.localeCompare(b.countryCode));

  return {
    uploads: folded?.uploads ?? 0,
    samples: (folded?.samples ?? 0) - (dropped?.samples ?? 0),
    newSquares: squares.reduce((sum, row) => sum + row.newSquares, 0),
    discoveries: { cells: cells?.cells ?? 0, sites: sites.reduce((sum, row) => sum + row.count, 0) },
    firstUploadAt: folded?.firstUploadAt?.toISOString() ?? null,
    lastUploadAt: folded?.lastUploadAt?.toISOString() ?? null,
    countries,
    ranks,
  };
}
