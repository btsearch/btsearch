import { bands, cells, countryBands, proposedCells } from "@openbts/drizzle";
import { eq } from "drizzle-orm";

import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import type { AuditEntryInput, AuditRecorder } from "../audit/index.js";
import type { BandRow, CountryBandRow } from "./serialize.js";

export function countryBandDeleteEntries(rows: readonly CountryBandRow[]): AuditEntryInput[] {
  return rows.map((row) => ({ entity: "country_bands", op: "delete", recordId: `${row.countryCode}:${row.bandId}`, old: row }));
}

export async function removeBand(tx: DbTx, audit: AuditRecorder, band: BandRow): Promise<void> {
  const [[cell], [proposedCell]] = await Promise.all([
    tx.select({ id: cells.id }).from(cells).where(eq(cells.band_id, band.id)).limit(1),
    tx.select({ id: proposedCells.id }).from(proposedCells).where(eq(proposedCells.band_id, band.id)).limit(1),
  ]);
  if (cell || proposedCell) {
    throw new ErrorResponse("CONFLICT", { message: "Cannot delete a band that cells or submissions still use" });
  }

  const removedCountryBands = await tx.delete(countryBands).where(eq(countryBands.bandId, band.id)).returning();
  await tx.delete(bands).where(eq(bands.id, band.id));
  await audit.logMany([...countryBandDeleteEntries(removedCountryBands), { entity: "bands", op: "delete", recordId: band.id, old: band }]);
}
