import { movesStationAlone } from "./changes";
import type { EditSession, HostSite, SiteStation } from "./types";

export function isOfOtherOperator(station: SiteStation, operatorId: number | null): boolean {
  return station.operatorId === null || station.operatorId !== operatorId;
}

export function hostsOtherStations(site: HostSite, operatorId: number | null): boolean {
  const { stationId } = site;
  return stationId !== null && site.stations.some((station) => station.hostStationId === stationId && isOfOtherOperator(station, operatorId));
}

export function listHostCandidates(session: EditSession, site: HostSite | null): SiteStation[] {
  const { operatorId } = session.draft.station;
  if (site === null || movesStationAlone(session) || hostsOtherStations(site, operatorId)) return [];
  return site.stations.filter((station) => station.hostStationId === null && isOfOtherOperator(station, operatorId));
}

export function findSiteStation(site: HostSite | null, stationId: number | null): SiteStation | null {
  if (site === null || stationId === null) return null;
  return site.stations.find((station) => station.id === stationId) ?? null;
}
