import { ukePermits } from "@openbts/drizzle";
import { db } from "@openbts/drizzle/db";
import { inArray } from "drizzle-orm";

import { BATCH_SIZE } from "./config.js";
import { chunk } from "./utils.js";

type UkePermitActivityKeyInput = {
  uke_station_id: number;
  band_id: number;
  decision_number: string;
  decision_type: (typeof ukePermits.$inferSelect)["decision_type"];
  expiry_date: Date;
};

function getUkePermitActivityKey(permit: UkePermitActivityKeyInput): string {
  return `${permit.uke_station_id}|${permit.band_id}|${permit.decision_number}|${permit.decision_type}|${permit.expiry_date.toISOString()}`;
}

export async function findCreatedPermitStationIds(permits: UkePermitActivityKeyInput[]): Promise<number[]> {
  if (permits.length === 0) return [];

  const permitsByKey = new Map<string, UkePermitActivityKeyInput>();
  for (const permit of permits) permitsByKey.set(getUkePermitActivityKey(permit), permit);

  const stationIds = Array.from(new Set(Array.from(permitsByKey.values(), (permit) => permit.uke_station_id)));
  const existingKeys = new Set<string>();

  const existingGroups = await Promise.all(
    chunk(stationIds, BATCH_SIZE).map((stationIdGroup) =>
      db
        .select({
          uke_station_id: ukePermits.uke_station_id,
          band_id: ukePermits.band_id,
          decision_number: ukePermits.decision_number,
          decision_type: ukePermits.decision_type,
          expiry_date: ukePermits.expiry_date,
        })
        .from(ukePermits)
        .where(inArray(ukePermits.uke_station_id, stationIdGroup)),
    ),
  );

  for (const existing of existingGroups) {
    for (const permit of existing) existingKeys.add(getUkePermitActivityKey(permit));
  }

  const createdStationIds = new Set<number>();
  for (const [key, permit] of permitsByKey) {
    if (existingKeys.has(key)) continue;
    createdStationIds.add(permit.uke_station_id);
  }

  return Array.from(createdStationIds);
}
