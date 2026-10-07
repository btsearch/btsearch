import type { HistoryPartKind, StationHistoryAction, StationHistoryChange, StationHistoryItem } from "./types";

type HistoryEntry = { key: string; item: StationHistoryItem; part: StationHistoryChange; revertParts?: StationHistoryChange[] };
type HistoryDayGroup = { key: string; label: string; entries: HistoryEntry[] };

const PART_TITLE_KEYS: Record<HistoryPartKind, Record<StationHistoryAction, string>> = {
  station: {
    create: "stationDetails:history.titles.station_create",
    update: "stationDetails:history.titles.station_update",
    delete: "stationDetails:history.titles.station_delete",
  },
  location: {
    create: "stationDetails:history.titles.location_create",
    update: "stationDetails:history.titles.location_update",
    delete: "stationDetails:history.titles.location_delete",
  },
  cells: {
    create: "stationDetails:history.titles.cells_create",
    update: "stationDetails:history.titles.cells_update",
    delete: "stationDetails:history.titles.cells_delete",
  },
  sectors: {
    create: "stationDetails:history.titles.sectors_update",
    update: "stationDetails:history.titles.sectors_update",
    delete: "stationDetails:history.titles.sectors_update",
  },
  identifiers: {
    create: "stationDetails:history.titles.network_ids_create",
    update: "stationDetails:history.titles.network_ids_update",
    delete: "stationDetails:history.titles.network_ids_delete",
  },
  backhaul: {
    create: "stationDetails:history.titles.uplink_create",
    update: "stationDetails:history.titles.uplink_update",
    delete: "stationDetails:history.titles.uplink_delete",
  },
  photos: {
    create: "stationDetails:history.titles.photos_create",
    update: "stationDetails:history.titles.photos_update",
    delete: "stationDetails:history.titles.photos_delete",
  },
};

export function getPartTitleKey(part: Pick<StationHistoryChange, "kind" | "action">): string {
  return PART_TITLE_KEYS[part.kind][part.action];
}

function listItemEntries(item: StationHistoryItem): HistoryEntry[] {
  const firstPart = item.changes.at(0);
  if (firstPart === undefined) return [];
  if (item.isRevert) return [{ key: String(item.id), item, part: firstPart, revertParts: item.changes }];
  return item.changes.map((part, position) => ({ key: `${item.id}:${position}`, item, part }));
}

export function groupHistoryByDay(items: readonly StationHistoryItem[], locale: string): HistoryDayGroup[] {
  const groups: HistoryDayGroup[] = [];
  for (const item of items) {
    const entries = listItemEntries(item);
    if (entries.length === 0) continue;

    const date = new Date(item.createdAt);
    const key = date.toDateString();
    let group = groups.at(-1);
    if (group?.key !== key) {
      group = { key, label: date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }), entries: [] };
      groups.push(group);
    }
    group.entries.push(...entries);
  }
  return groups;
}
