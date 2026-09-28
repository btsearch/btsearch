import { stationUplinks, type stations } from "@openbts/drizzle";
import { inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";

export type UplinkType = typeof stationUplinks.$inferSelect.type;

export const uplinkSpeedSchema = z.int().min(1).max(2147483647);

const UPLINK_TYPE_VALUES = new Set<string>(["fiber", "microwave", "satellite"]);

export function isUplinkType(value: unknown): value is UplinkType {
  return typeof value === "string" && UPLINK_TYPE_VALUES.has(value);
}

export function parseUplinkTypesParam(value?: string): UplinkType[] | undefined {
  if (!value) return undefined;
  return [...new Set(value.split(",").filter(isUplinkType))];
}

export function buildUplinkCondition(stationId: typeof stations.id, uplinkTypes: UplinkType[]): ReturnType<typeof sql> {
  if (uplinkTypes.length === 0) return sql`false`;
  return sql`EXISTS (SELECT 1 FROM ${stationUplinks} WHERE ${stationUplinks.station_id} = ${stationId} AND ${inArray(stationUplinks.type, uplinkTypes)})`;
}
