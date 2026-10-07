import type { LocationStationRecord, PhotoRecord } from "../../types";
import { getOperatorShortLabel, sortLocationStations } from "../../utils/stations";

export type OtherLocationPhoto = {
  photo: PhotoRecord;
  stationNames: string;
  selections: { station: LocationStationRecord; isMain: boolean }[];
};

const STATION_NAME_SEPARATOR = ", ";

function getStationName(station: LocationStationRecord): string {
  const operatorLabel = getOperatorShortLabel(station.operator);
  return operatorLabel === null ? station.siteId : `${operatorLabel} ${station.siteId}`;
}

export function listOtherLocationPhotos(
  locationPhotos: readonly PhotoRecord[] | undefined,
  stationId: number,
  stationPhotos: readonly PhotoRecord[] | undefined,
  locationStations: readonly LocationStationRecord[] | undefined,
): OtherLocationPhoto[] {
  if (locationPhotos === undefined) return [];

  const shownPhotoIds = new Set(stationPhotos?.map((photo) => photo.id));
  const stations = sortLocationStations(locationStations ?? []);
  const otherPhotos: OtherLocationPhoto[] = [];
  for (const photo of locationPhotos) {
    const selectionsByStationId = new Map(photo.selections.map((selection) => [selection.stationId, selection]));
    if (selectionsByStationId.has(stationId) || shownPhotoIds.has(photo.id)) continue;

    const selections = stations.flatMap((station) => {
      const selection = selectionsByStationId.get(station.id);
      return selection === undefined ? [] : [{ station, isMain: selection.isMain }];
    });
    const stationNames = selections.map(({ station }) => getStationName(station)).join(STATION_NAME_SEPARATOR);
    otherPhotos.push({ photo, stationNames, selections });
  }

  return otherPhotos;
}
