import { ukePermits } from "@openbts/drizzle";
import { inArray } from "drizzle-orm";

import { BATCH_SIZE } from "./config.js";
import { db } from "./database.js";
import { type UkePermitKeyInput, getUkePermitKey } from "./permit-key.js";
import { chunk } from "./utils.js";

export async function findCreatedPermitStationIds(permits: UkePermitKeyInput[]): Promise<number[]> {
  if (permits.length === 0) return [];

  const permitsByKey = new Map<string, UkePermitKeyInput>();
  for (const permit of permits) permitsByKey.set(getUkePermitKey(permit), permit);

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
    for (const permit of existing) existingKeys.add(getUkePermitKey(permit));
  }

  const createdStationIds = new Set<number>();
  for (const [key, permit] of permitsByKey) {
    if (existingKeys.has(key)) continue;
    createdStationIds.add(permit.uke_station_id);
  }

  return Array.from(createdStationIds);
}
