import { ukeBands } from "@openbts/drizzle";
import { sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod/v4";

const ukeBandSelectSchema = createSelectSchema(ukeBands);

const newestTechnologyFirst = sql<number>`CASE ${ukeBands.rat} WHEN 'NR' THEN 0 WHEN 'LTE' THEN 1 WHEN 'UMTS' THEN 2 WHEN 'CDMA' THEN 3 WHEN 'GSM' THEN 4 ELSE 5 END`;

export const PERMIT_BAND_ORDER = [newestTechnologyFirst, ukeBands.variant, ukeBands.value, ukeBands.id];

export const permitBandSchema = ukeBandSelectSchema.extend({ duplex: z.null(), code: z.null() });
export type UkeBandRow = z.infer<typeof ukeBandSelectSchema>;
export type PermitBand = z.infer<typeof permitBandSchema>;

export function toPermitBand(row: UkeBandRow): PermitBand {
  return { id: row.id, value: row.value, rat: row.rat, name: row.name, duplex: null, variant: row.variant, code: null };
}
