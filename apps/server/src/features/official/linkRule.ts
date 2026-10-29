export type StationLink = { stationId: number; officialSiteId: number };
export type LinkableSite = {
  officialSiteId: number;
  sourceId: number;
  operatorId: number;
  siteId: string;
  longitude: number;
  latitude: number;
};
export type LinkableStation = { stationId: number; operatorId: number | null; siteId: string; longitude: number | null; latitude: number | null };

export function groupKey({ operatorId, siteId }: Pick<LinkableStation, "operatorId" | "siteId">): string {
  return JSON.stringify([operatorId, siteId]);
}

function sourceGroupKey({ sourceId, operatorId, siteId }: LinkableSite): string {
  return JSON.stringify([sourceId, operatorId, siteId]);
}

function isAtTheStation(site: LinkableSite, station: LinkableStation): boolean {
  return site.longitude === station.longitude && site.latitude === station.latitude;
}

export function decideStationLinks(sites: readonly LinkableSite[], ourStations: readonly LinkableStation[]): StationLink[] {
  const sitesByGroup = Map.groupBy(sites, groupKey);
  const siteCountsBySourceGroup = new Map([...Map.groupBy(sites, sourceGroupKey)].map(([key, groupSites]) => [key, groupSites.length]));
  const isTheOnlySiteOfItsSource = (site: LinkableSite) => siteCountsBySourceGroup.get(sourceGroupKey(site)) === 1;

  return ourStations.flatMap((station) => {
    const linkable = (sitesByGroup.get(groupKey(station)) ?? []).filter((site) => isAtTheStation(site, station) || isTheOnlySiteOfItsSource(site));
    const [site, ...others] = linkable.length > 1 ? linkable.filter((candidate) => isAtTheStation(candidate, station)) : linkable;
    return site && others.length === 0 ? [{ stationId: station.stationId, officialSiteId: site.officialSiteId }] : [];
  });
}
