import type { QueryClient } from "@tanstack/react-query";

import { canReplaceStationRecord, stationWindowKeys } from "@/features/station-details/station/api";
import type { StationRecord } from "@/features/station-details/station/types";

type ListedStation = {
  station: StationRecord;
  loadedAt: number;
};

export function seedStationWindow(queryClient: QueryClient, { station, loadedAt }: ListedStation): void {
  if (!canReplaceStationRecord(queryClient, station.id, loadedAt)) return;

  queryClient.setQueryData<StationRecord>(stationWindowKeys.station(station.id), station, { updatedAt: loadedAt });
}
