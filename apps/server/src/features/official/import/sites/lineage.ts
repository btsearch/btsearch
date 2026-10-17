export type MoveCandidate = {
  siteCode: string;
  operatorId: number;
  locationId: number;
  firstOrdinal: number;
  slice: string;
  officialSiteId: number;
  fromLocationId: number;
};
export type SiteMove = {
  officialSiteId: number;
  siteCode: string;
  operatorId: number;
  fromLocationId: number;
  toLocationId: number;
  slice: string;
};

export function decideSiteMoves(candidates: readonly MoveCandidate[]): SiteMove[] {
  const candidatesByPair = Map.groupBy(candidates, ({ operatorId, siteCode }) => JSON.stringify([operatorId, siteCode]));
  const moves: SiteMove[] = [];

  for (const pairCandidates of candidatesByPair.values()) {
    if (new Set(pairCandidates.map((candidate) => candidate.officialSiteId)).size !== 1) continue;

    const last = pairCandidates.reduce((latest, candidate) => (candidate.firstOrdinal > latest.firstOrdinal ? candidate : latest));
    moves.push({
      officialSiteId: last.officialSiteId,
      siteCode: last.siteCode,
      operatorId: last.operatorId,
      fromLocationId: last.fromLocationId,
      toLocationId: last.locationId,
      slice: last.slice,
    });
  }

  return moves;
}
