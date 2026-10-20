export type MoveCandidate = {
  officialSiteId: number;
  fromLocationId: number;
  locationId: number;
  firstOrdinal: number;
  slice: string;
};
export type SiteMove = {
  officialSiteId: number;
  fromLocationId: number;
  toLocationId: number;
  slice: string;
};

export function decideSiteMoves(candidates: readonly MoveCandidate[]): SiteMove[] {
  const candidatesBySite = Map.groupBy(candidates, (candidate) => candidate.officialSiteId);
  const moves: SiteMove[] = [];

  for (const siteCandidates of candidatesBySite.values()) {
    const last = siteCandidates.reduce((latest, candidate) => (candidate.firstOrdinal > latest.firstOrdinal ? candidate : latest));
    moves.push({ officialSiteId: last.officialSiteId, fromLocationId: last.fromLocationId, toLocationId: last.locationId, slice: last.slice });
  }

  return moves;
}
