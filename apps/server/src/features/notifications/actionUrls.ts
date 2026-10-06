import { MAX_LATITUDE, MAX_LONGITUDE } from "@openbts/shared/contract";

export type MapCoordinates = { latitude: number; longitude: number };
type StationActionTarget = {
  id: number;
  location?: MapCoordinates | null;
};

const MAP_POSITION_PATTERN = /^\/#map=[^/~]+\/([^/~]+)\/([^/~]+)(?:[/~]|$)/;

export function buildInternalStationActionUrl(station: StationActionTarget): string | undefined {
  if (!station.location) return undefined;
  return `/#map=16.00/${station.location.latitude}/${station.location.longitude}~f~S${station.id}`;
}

export function buildUkeStationActionUrl(station: StationActionTarget): string | undefined {
  if (!station.location) return undefined;
  return `/#map=16.00/${station.location.latitude}/${station.location.longitude}~fu~U${station.id}`;
}

export function buildMapLocationActionUrl(location: MapCoordinates): string {
  return `/#map=16.00/${location.latitude}/${location.longitude}`;
}

export function parseActionUrlCoordinates(actionUrl: string | null): MapCoordinates | null {
  const position = actionUrl === null ? null : MAP_POSITION_PATTERN.exec(actionUrl);
  if (!position) return null;

  const latitude = Number(position[1]);
  const longitude = Number(position[2]);
  return Math.abs(latitude) <= MAX_LATITUDE && Math.abs(longitude) <= MAX_LONGITUDE ? { latitude, longitude } : null;
}
