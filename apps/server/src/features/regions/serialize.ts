import { regions } from "@openbts/drizzle";
import type { Region } from "@openbts/shared/contract";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

const regionSelectSchema = createSelectSchema(regions);

export type RegionRow = z.infer<typeof regionSelectSchema>;

export function toRegion(row: RegionRow): Region {
  return { id: row.id, countryCode: row.countryCode, code: row.code, name: row.name, isoCode: row.isoCode };
}
