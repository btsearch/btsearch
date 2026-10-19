import { stationBackhauls, type stations } from "@openbts/drizzle";
import { inArray, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import { z } from "zod/v4";

const stationBackhaulSelectSchema = createSelectSchema(stationBackhauls);

export type BackhaulMedium = z.infer<typeof stationBackhaulSelectSchema>["type"];

export const backhaulSpeedSchema = z.int().min(1).max(2147483647);

const BACKHAUL_MEDIUM_VALUES = new Set<string>(["fiber", "microwave", "satellite", "xdsl"]);

export function isBackhaulMedium(value: unknown): value is BackhaulMedium {
  return typeof value === "string" && BACKHAUL_MEDIUM_VALUES.has(value);
}

export function parseBackhaulMediumsParam(value?: string): BackhaulMedium[] | undefined {
  if (!value) return undefined;
  return [...new Set(value.split(",").filter(isBackhaulMedium))];
}

export function buildBackhaulCondition(stationId: typeof stations.id, backhaulMediums: BackhaulMedium[]): ReturnType<typeof sql> {
  if (backhaulMediums.length === 0) return sql`false`;
  return sql`EXISTS (SELECT 1 FROM ${stationBackhauls} WHERE ${stationBackhauls.station_id} = ${stationId} AND ${inArray(stationBackhauls.type, backhaulMediums)})`;
}
