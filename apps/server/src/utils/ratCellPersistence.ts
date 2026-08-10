import { gsmCells, lteCells, nrCells, umtsCells } from "@openbts/drizzle";
import type { Database } from "@openbts/drizzle/db";
import { eq } from "drizzle-orm";
import type z from "zod";

import type { DbTx } from "../types/global.ts";
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
import { computeGnbidLength } from "./submission.helpers.ts";

export type NormalRat = "GSM" | "UMTS" | "LTE" | "NR";

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
export type RATCellDetailsRow =
  | typeof gsmCells.$inferSelect
  | typeof umtsCells.$inferSelect
  | typeof lteCells.$inferSelect
  | typeof nrCells.$inferSelect;
type DbWriter = DbTx | Database;

export function isNormalRat(rat: string): rat is NormalRat {
  return rat === "GSM" || rat === "UMTS" || rat === "LTE" || rat === "NR";
}

export async function updateRATCellDetails(tx: DbWriter, rat: NormalRat, cellId: number, cellDetails: RATUpdateDetails): Promise<void> {
  await updateRATCellDetailsReturning(tx, rat, cellId, cellDetails);
}

export async function updateRATCellDetailsReturning(
  tx: DbWriter,
  rat: NormalRat,
  cellId: number,
  cellDetails: RATUpdateDetails,
): Promise<RATCellDetailsRow | null> {
  switch (rat) {
    case "GSM": {
      const details = cellDetails as GSMUpdateDetails;
      const [updated] = await tx
        .update(gsmCells)
        .set({ ...details, updatedAt: new Date() })
        .where(eq(gsmCells.cell_id, cellId))
        .returning();
      return updated ?? null;
    }
    case "UMTS": {
      const details = cellDetails as UMTSUpdateDetails;
      const [updated] = await tx
        .update(umtsCells)
        .set({ ...details, updatedAt: new Date() })
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
      const gnbidLength = details.gnbid ? computeGnbidLength(details.gnbid) : details.gnbid_length;
      const [updated] = await tx
        .update(nrCells)
        .set({ ...details, gnbid_length: gnbidLength, updatedAt: new Date() })
        .where(eq(nrCells.cell_id, cellId))
        .returning();
      return updated ?? null;
    }
  }
}

export async function insertRATCellDetails(tx: DbWriter, rat: NormalRat, cellId: number, cellDetails: RATInsertDetails): Promise<void> {
  await insertRATCellDetailsReturning(tx, rat, cellId, cellDetails);
}

export async function insertRATCellDetailsReturning(
  tx: DbWriter,
  rat: NormalRat,
  cellId: number,
  cellDetails: RATInsertDetails,
): Promise<RATCellDetailsRow | null> {
  switch (rat) {
    case "GSM": {
      const details = cellDetails as GSMInsertDetails;
      const [inserted] = await tx.insert(gsmCells).values({ cell_id: cellId, lac: details.lac, cid: details.cid, e_gsm: details.e_gsm }).returning();
      return inserted ?? null;
    }
    case "UMTS": {
      const details = cellDetails as UMTSInsertDetails;
      const [inserted] = await tx
        .insert(umtsCells)
        .values({ cell_id: cellId, lac: details.lac, rnc: details.rnc, cid: details.cid, arfcn: details.arfcn })
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
          gnbid_length: computeGnbidLength(details.gnbid),
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
