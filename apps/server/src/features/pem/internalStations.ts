import { operators, stations } from "@openbts/drizzle";
import db from "@openbts/drizzle/db";
import { getNetworksSiblingMnc } from "@openbts/shared/operatorUtils";
import { and, eq, inArray } from "drizzle-orm";

type MatchableItem = { station_id: string | null; operator: { mnc: number | null } | null };
type MatchedItem<T extends MatchableItem> = T & { internal_station_id: number | null };

function getStationMatchKey(stationId: string, mnc: number) {
  return `${mnc}:${stationId}`;
}

export async function attachInternalStationIds<T extends MatchableItem>(items: T[]): Promise<MatchedItem<T>[]> {
  const stationIds = new Set<string>();
  const mncs = new Set<number>();
  for (const item of items) {
    const mnc = item.operator?.mnc ?? null;
    if (!item.station_id || mnc === null) continue;
    stationIds.add(item.station_id);
    mncs.add(mnc);
    const siblingMnc = getNetworksSiblingMnc(mnc);
    if (siblingMnc !== null) mncs.add(siblingMnc);
  }

  const rows =
    stationIds.size > 0
      ? await db
          .select({ id: stations.id, stationId: stations.station_id, mnc: operators.mnc })
          .from(stations)
          .innerJoin(operators, eq(operators.id, stations.operator_id))
          .where(and(inArray(stations.station_id, [...stationIds]), inArray(operators.mnc, [...mncs])))
      : [];

  const internalIdByKey = new Map<string, number>();
  for (const row of rows) if (row.mnc !== null) internalIdByKey.set(getStationMatchKey(row.stationId, row.mnc), row.id);

  return items.map((item) => {
    const mnc = item.operator?.mnc ?? null;
    if (!item.station_id || mnc === null) return { ...item, internal_station_id: null };
    const siblingMnc = getNetworksSiblingMnc(mnc);
    const exactId = internalIdByKey.get(getStationMatchKey(item.station_id, mnc));
    const siblingId = siblingMnc === null ? undefined : internalIdByKey.get(getStationMatchKey(item.station_id, siblingMnc));
    return { ...item, internal_station_id: exactId ?? siblingId ?? null };
  });
}
