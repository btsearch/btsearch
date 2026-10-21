import { unique } from "../../../../lib/collections.js";
import { REPORTED_IDS_LIMIT } from "../config.js";

export type RemapSite = { id: number; siteCode: string | null; sourceRef: string | null; operatorId: number };
export type RemapPermit = { id: number; officialSiteId: number; valuesKey: string };
export type RemapListing = { permitId: number; datasetId: number; licenseeId: number | null };

export type RemapInput = {
  licenseeId: number;
  toOperatorId: number | null;
  operatorByLicensee: ReadonlyMap<number, number | null>;
  sites: readonly RemapSite[];
  targets: readonly RemapSite[];
  permits: readonly RemapPermit[];
  listings: readonly RemapListing[];
};

export type RemapCounts = {
  sitesRekeyed: number;
  sitesMerged: number;
  sitesSplit: number;
  permitsMoved: number;
  permitsMerged: number;
  permitsBlocked: { count: number; ids: number[] };
  listingsRemoved: number;
};

export type RemapPlan = {
  rekeyedSiteIds: number[];
  splits: { fromSiteId: number; siteCode: string; permitIds: number[] }[];
  moves: { permitId: number; toSiteId: number }[];
  merges: { permitId: number; intoPermitId: number }[];
  emptiedSites: { siteId: number; intoSiteId: number }[];
  unlistings: { permitId: number; datasetId: number; officialSiteId: number }[];
  remappedSiteIds: number[];
  touchedSiteIds: number[];
  counts: RemapCounts;
};

type Fate = "moves" | "blocked" | "stays";

function emptyPlan(): RemapPlan {
  return {
    rekeyedSiteIds: [],
    splits: [],
    moves: [],
    merges: [],
    emptiedSites: [],
    unlistings: [],
    remappedSiteIds: [],
    touchedSiteIds: [],
    counts: {
      sitesRekeyed: 0,
      sitesMerged: 0,
      sitesSplit: 0,
      permitsMoved: 0,
      permitsMerged: 0,
      permitsBlocked: { count: 0, ids: [] },
      listingsRemoved: 0,
    },
  };
}

function planUnlisting(input: RemapInput): RemapPlan {
  const plan = emptyPlan();
  const listingsByPermit = Map.groupBy(input.listings, (listing) => listing.permitId);

  for (const permit of input.permits) {
    const listings = listingsByPermit.get(permit.id) ?? [];
    const named = listings.filter((listing) => listing.licenseeId === input.licenseeId);
    plan.unlistings.push(...named.map(({ permitId, datasetId }) => ({ permitId, datasetId, officialSiteId: permit.officialSiteId })));
    if (named.length > 0 && named.length === listings.length) plan.touchedSiteIds.push(permit.officialSiteId);
  }

  plan.touchedSiteIds = unique(plan.touchedSiteIds);
  plan.counts.listingsRemoved = plan.unlistings.length;
  return plan;
}

export function planRemap(input: RemapInput): RemapPlan {
  const { licenseeId, toOperatorId } = input;
  if (toOperatorId === null) return planUnlisting(input);

  const plan = emptyPlan();
  const listingsByPermit = Map.groupBy(input.listings, (listing) => listing.permitId);
  const permitsBySite = Map.groupBy(input.permits, (permit) => permit.officialSiteId);
  const targetByCode = new Map(input.targets.map((target) => [target.siteCode, target]));
  const claimedCodes = new Set<string>();
  const blockedPermitIds: number[] = [];
  const rekey = (siteId: number, movingPermits: number) => {
    plan.counts.permitsMoved += movingPermits;
    plan.rekeyedSiteIds.push(siteId);
    plan.remappedSiteIds.push(siteId);
    plan.touchedSiteIds.push(siteId);
  };

  const fateOf = (permit: RemapPermit, site: RemapSite): Fate => {
    const listings = listingsByPermit.get(permit.id) ?? [];
    if (!listings.some((listing) => listing.licenseeId === licenseeId)) return "stays";

    const followsTheLicensee = listings.every((listing) => {
      if (listing.licenseeId === licenseeId) return true;
      const operatorId = listing.licenseeId === null ? site.operatorId : (input.operatorByLicensee.get(listing.licenseeId) ?? null);
      return operatorId === toOperatorId;
    });
    return followsTheLicensee ? "moves" : "blocked";
  };

  for (const site of input.sites.toSorted((left, right) => left.id - right.id)) {
    if (site.operatorId === toOperatorId) continue;

    const permits = permitsBySite.get(site.id) ?? [];
    const fates = Map.groupBy(permits, (permit) => fateOf(permit, site));
    const moving = fates.get("moves") ?? [];
    blockedPermitIds.push(...(fates.get("blocked") ?? []).map((permit) => permit.id));
    if (moving.length === 0) continue;

    const { siteCode } = site;
    const everyPermitMoves = moving.length === permits.length;
    if (site.sourceRef !== null || siteCode === null) {
      if (everyPermitMoves) rekey(site.id, moving.length);
      else blockedPermitIds.push(...moving.map((permit) => permit.id));
      continue;
    }

    if (claimedCodes.has(siteCode)) throw new Error(`Two sites with the code ${siteCode} would move to one site: remap cannot tell them apart`);
    claimedCodes.add(siteCode);

    const target = targetByCode.get(siteCode);
    if (!target && everyPermitMoves) {
      rekey(site.id, moving.length);
      continue;
    }
    plan.counts.permitsMoved += moving.length;
    if (!everyPermitMoves) plan.touchedSiteIds.push(site.id);
    if (!target) {
      plan.splits.push({ fromSiteId: site.id, siteCode, permitIds: moving.map((permit) => permit.id) });
      continue;
    }

    const targetPermitByKey = new Map((permitsBySite.get(target.id) ?? []).map((permit) => [permit.valuesKey, permit.id]));
    for (const permit of moving) {
      const equalPermitId = targetPermitByKey.get(permit.valuesKey);
      if (equalPermitId === undefined) plan.moves.push({ permitId: permit.id, toSiteId: target.id });
      else plan.merges.push({ permitId: permit.id, intoPermitId: equalPermitId });
    }
    if (everyPermitMoves) plan.emptiedSites.push({ siteId: site.id, intoSiteId: target.id });
    else plan.counts.sitesSplit += 1;
    plan.remappedSiteIds.push(target.id);
    plan.touchedSiteIds.push(target.id);
  }

  plan.counts.sitesRekeyed = plan.rekeyedSiteIds.length;
  plan.counts.sitesMerged = plan.emptiedSites.length;
  plan.counts.sitesSplit += plan.splits.length;
  plan.counts.permitsMerged = plan.merges.length;
  plan.counts.permitsBlocked = { count: blockedPermitIds.length, ids: blockedPermitIds.slice(0, REPORTED_IDS_LIMIT) };
  return plan;
}
