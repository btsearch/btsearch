import type { Region } from "../../types";
import type { BreakdownTotals } from "../../utils/bands";
import { type Loadable, toLoadable } from "../shared/loadable";

type StationsByRegion = ReadonlyMap<number, BreakdownTotals>;

export type RegionListProps = {
  regions: Region[];
  stationsByRegion: StationsByRegion | undefined;
  hasStationsLoadFailed: boolean;
  canEdit: boolean;
  onEdit: (region: Region) => void;
  onDelete: (region: Region) => void;
};

export function getActiveStationCount(stationsByRegion: StationsByRegion | undefined, regionId: number, hasLoadFailed: boolean): Loadable<number> {
  const count = stationsByRegion === undefined ? undefined : (stationsByRegion.get(regionId)?.stations ?? 0);
  return toLoadable(count, hasLoadFailed);
}
