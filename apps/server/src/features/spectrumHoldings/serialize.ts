import { spectrumHoldings } from "@openbts/drizzle";
import type { SpectrumHolding } from "@openbts/shared/contract";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

const spectrumHoldingSelectSchema = createSelectSchema(spectrumHoldings);

export type SpectrumHoldingRow = z.infer<typeof spectrumHoldingSelectSchema>;

export function uplinkKhzOf(row: Pick<SpectrumHoldingRow, "uplinkLowKhz" | "uplinkHighKhz">): [number, number] | null {
  return row.uplinkLowKhz === null || row.uplinkHighKhz === null ? null : [row.uplinkLowKhz, row.uplinkHighKhz];
}

export function toSpectrumHolding(row: SpectrumHoldingRow): SpectrumHolding {
  return {
    id: row.id,
    operatorId: row.operatorId,
    jointOperatorId: row.jointOperatorId,
    bandId: row.bandId,
    regionId: row.regionId,
    downlinkKhz: [row.downlinkLowKhz, row.downlinkHighKhz],
    uplinkKhz: uplinkKhzOf(row),
    validFrom: row.validFrom,
    validTo: row.validTo,
    source: row.source,
  };
}
