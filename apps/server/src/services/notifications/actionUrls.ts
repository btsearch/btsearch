type MapCoordinates = { latitude: number; longitude: number };
type StationActionTarget = {
  id: number;
  location?: MapCoordinates | null;
};

export function buildInternalStationActionUrl(station: StationActionTarget): string | undefined {
  if (!station.location) return undefined;
  return `/#map=16.00/${station.location.latitude}/${station.location.longitude}~f~S${station.id}`;
}

export function buildUkeStationActionUrl(station: StationActionTarget): string | undefined {
  if (!station.location) return undefined;
  return `/#map=16.00/${station.location.latitude}/${station.location.longitude}~fu~S${station.id}`;
}

export function buildMapLocationActionUrl(location: MapCoordinates): string {
  return `/#map=16.00/${location.latitude}/${location.longitude}`;
}
