import { gsmCells, lteCells, nrCells, umtsCells } from "@openbts/drizzle";
import type { Database } from "@openbts/drizzle/db";
import type { CountryFeatures } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type z from "zod";

import type { DbTx } from "../../types/global.ts";
import {
  gsmInsertSchema,
  gsmUpdateSchema,
  lteInsertSchema,
  lteUpdateSchema,
  nrInsertSchema,
  nrUpdateSchema,
  umtsInsertSchema,
  umtsUpdateSchema,
} from "./ratCellSchemas.ts";

export const NORMAL_RATS = ["GSM", "UMTS", "LTE", "NR"] as const;
export type NormalRat = (typeof NORMAL_RATS)[number];

export type GSMUpdateDetails = z.infer<typeof gsmUpdateSchema>;
export type UMTSUpdateDetails = z.infer<typeof umtsUpdateSchema>;
export type LTEUpdateDetails = z.infer<typeof lteUpdateSchema>;
export type NRUpdateDetails = z.infer<typeof nrUpdateSchema>;
export type GSMInsertDetails = z.infer<typeof gsmInsertSchema>;
export type UMTSInsertDetails = z.infer<typeof umtsInsertSchema>;
export type LTEInsertDetails = z.infer<typeof lteInsertSchema>;
export type NRInsertDetails = z.infer<typeof nrInsertSchema>;
export type RATInsertDetails = GSMInsertDetails | UMTSInsertDetails | LTEInsertDetails | NRInsertDetails;
export type RATUpdateDetails = GSMUpdateDetails | UMTSUpdateDetails | LTEUpdateDetails | NRUpdateDetails;
const gsmCellSelectSchema = createSelectSchema(gsmCells);
const umtsCellSelectSchema = createSelectSchema(umtsCells);
const lteCellSelectSchema = createSelectSchema(lteCells);
const nrCellSelectSchema = createSelectSchema(nrCells);

export type RATCellDetailsRow =
  | z.infer<typeof gsmCellSelectSchema>
  | z.infer<typeof umtsCellSelectSchema>
  | z.infer<typeof lteCellSelectSchema>
  | z.infer<typeof nrCellSelectSchema>;
type DbWriter = DbTx | Database;

export function isNormalRat(rat: string): rat is NormalRat {
  return NORMAL_RATS.some((normalRat) => normalRat === rat);
}

export async function updateRATCellDetails(
  tx: DbWriter,
  rat: NormalRat,
  cellId: number,
  cellDetails: RATUpdateDetails,
  features: CountryFeatures,
): Promise<void> {
  await updateRATCellDetailsReturning(tx, rat, cellId, cellDetails, features);
}

export async function updateRATCellDetailsReturning(
  tx: DbWriter,
  rat: NormalRat,
  cellId: number,
  cellDetails: RATUpdateDetails,
  features: CountryFeatures,
): Promise<RATCellDetailsRow | null> {
  switch (rat) {
    case "GSM": {
      const details = cellDetails as GSMUpdateDetails;
      const bsic = features.bsic ? details.bsic : undefined;
      const [updated] = await tx
        .update(gsmCells)
        .set({ ...details, bsic, updatedAt: new Date() })
        .where(eq(gsmCells.cell_id, cellId))
        .returning();
      return updated ?? null;
    }
    case "UMTS": {
      const details = cellDetails as UMTSUpdateDetails;
      const psc = features.psc ? details.psc : undefined;
      const [updated] = await tx
        .update(umtsCells)
        .set({ ...details, psc, updatedAt: new Date() })
        .where(eq(umtsCells.cell_id, cellId))
        .returning();
      return updated ?? null;
    }
    case "LTE": {
      const details = cellDetails as LTEUpdateDetails;
      const [updated] = await tx
        .update(lteCells)
        .set({ ...details, updatedAt: new Date() })
        .where(eq(lteCells.cell_id, cellId))
        .returning();
      return updated ?? null;
    }
    case "NR": {
      const details = cellDetails as NRUpdateDetails;
      const [updated] = await tx
        .update(nrCells)
        .set({ ...details, updatedAt: new Date() })
        .where(eq(nrCells.cell_id, cellId))
        .returning();
      return updated ?? null;
    }
  }
}

export async function insertRATCellDetails(
  tx: DbWriter,
  rat: NormalRat,
  cellId: number,
  cellDetails: RATInsertDetails,
  features: CountryFeatures,
): Promise<void> {
  await insertRATCellDetailsReturning(tx, rat, cellId, cellDetails, features);
}

export async function insertRATCellDetailsReturning(
  tx: DbWriter,
  rat: NormalRat,
  cellId: number,
  cellDetails: RATInsertDetails,
  features: CountryFeatures,
): Promise<RATCellDetailsRow | null> {
  switch (rat) {
    case "GSM": {
      const details = cellDetails as GSMInsertDetails;
      const bsic = features.bsic ? details.bsic : undefined;
      const [inserted] = await tx
        .insert(gsmCells)
        .values({ cell_id: cellId, lac: details.lac, cid: details.cid, e_gsm: details.e_gsm, bsic })
        .returning();
      return inserted ?? null;
    }
    case "UMTS": {
      const details = cellDetails as UMTSInsertDetails;
      const psc = features.psc ? details.psc : undefined;
      const [inserted] = await tx
        .insert(umtsCells)
        .values({ cell_id: cellId, lac: details.lac, rnc: details.rnc, cid: details.cid, arfcn: details.arfcn, psc })
        .returning();
      return inserted ?? null;
    }
    case "LTE": {
      const details = cellDetails as LTEInsertDetails;
      const [inserted] = await tx
        .insert(lteCells)
        .values({
          cell_id: cellId,
          tac: details.tac,
          enbid: details.enbid,
          clid: details.clid,
          pci: details.pci,
          earfcn: details.earfcn,
          supports_iot: details.supports_iot,
        })
        .returning();
      return inserted ?? null;
    }
    case "NR": {
      const details = cellDetails as NRInsertDetails;
      const [inserted] = await tx
        .insert(nrCells)
        .values({
          cell_id: cellId,
          type: details.type,
          nrtac: details.nrtac,
          gnbid: details.gnbid,
          gnbid_length: details.gnbid_length,
          clid: details.clid,
          pci: details.pci,
          arfcn: details.arfcn,
          supports_nr_redcap: details.supports_nr_redcap,
        })
        .returning();
      return inserted ?? null;
    }
  }
}
