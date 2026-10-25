import {
  cells,
  crowdSettings,
  groupEstimates,
  locations,
  observationFlags,
  observedSites,
  siteEstimates,
  siteGroups,
  siteLinks,
  stations,
} from "@openbts/drizzle";
import type { ObservationFlagKind } from "@openbts/shared/contract";
import { type SQL, and, eq, gte, inArray, isNotNull, isNull, notExists, or, sql } from "drizzle-orm";

import db from "../../../../database/psql.js";
import { chunks, unique } from "../../../../lib/collections.js";
import type { DbTx } from "../../../../types/global.js";
import { logger } from "../../../../utils/logger.js";
import { getCountryFeaturesByCode } from "../../../stations/countryFeatures.js";
import { loadBandPlans } from "../../bandPlans.js";
import { liftStaleIgnores } from "../../review/ignores.js";
import { type ObservedSiteRecord, loadObservedSites } from "../../sites/read.js";
import type { NewCellStation } from "../cells/newCell.js";
import { daysAgo } from "../dates.js";
import { type RaisedFlag, SITE_FLAG_KINDS } from "../kinds.js";
import { observedSiteSubject } from "../subjects.js";
import { type FlagSyncCounts, NOTHING_SYNCED, flagsIn, syncFlags } from "../sync.js";
import { syncBearingFlags } from "./bearingDiffers.js";
import { fixedSiteFlags, isFlagSubject, membersOf } from "./flaggedSite.js";
import { moveFlags } from "./flagMoves.js";
import { loadPlacedCells, raiseNodeSpansPlacesFlag } from "./nodeSpansPlaces.js";
import { raisePositionDiffersFlag, stationMovedSinceFlag } from "./positionDiffers.js";
import { loadRegisterLinks, registerNumberOf } from "./registerNumbers.js";
import { RENUMBERED_WITHIN_M, loadNewSiteCells, loadRenumberCandidates, raiseRenumberedFlag } from "./renumbered.js";
import { syncSiteIdFlags } from "./siteIdKnown.js";
import { loadStationPlaces } from "./stationPlaces.js";
import { type MeasuredCell, buildSiteCells, loadMainCodes, loadSiteCellInputs, suggestStation } from "./stationSuggestion.js";
import { raiseSuggestedSiteFlag } from "./suggestedSite.js";
import { loadOwnEstimates, qualifiesAsUnmatched, raiseUnmatchedSiteFlag, shiftOf } from "./unmatchedSite.js";

const MEMBER_LISTING_KINDS = ["unmatchedSite", "positionShifts"] as const satisfies readonly ObservationFlagKind[];
const PASS_KINDS = [...SITE_FLAG_KINDS, "siteIdKnown", "bearingDiffers"] as const satisfies readonly ObservationFlagKind[];

const SEEN_WITHIN_DAYS = 90;
const QUIET_FOR_DAYS = 14;
const ESTIMATE_MARGIN_MS = 10 * 60 * 1000;
const SITES_PER_BATCH = 1000;

type CrowdSettings = { version: number; publicRadiusMaxM: number };

let estimatedSince: Date | null = null;

async function loadCrowdSettings(): Promise<CrowdSettings | undefined> {
  const [settings] = await db
    .select({ version: crowdSettings.publishedAlgorithmVersion, publicRadiusMaxM: crowdSettings.publicRadiusMaxM })
    .from(crowdSettings)
    .limit(1);
  return settings;
}

function listsAnyOf(siteIds: readonly number[]): SQL {
  const lists = siteIds.map((siteId) => sql`${JSON.stringify([siteId])}::jsonb`);
  return sql`${observationFlags.evidence}->'observedSiteIds' @> ANY(ARRAY[${sql.join(lists, sql`, `)}])`;
}

async function expandSubjects(siteIds: readonly number[], version: number): Promise<number[]> {
  const ofTheirGroups = db
    .select({ leadSiteId: siteGroups.leadSiteId })
    .from(siteGroups)
    .where(and(inArray(siteGroups.observedSiteId, [...siteIds]), eq(siteGroups.algorithmVersion, version)));
  const theirStations = db
    .select({ stationId: siteLinks.stationId })
    .from(siteLinks)
    .where(and(inArray(siteLinks.observedSiteId, [...siteIds]), eq(siteLinks.kind, "matched")));
  const [members, flagged] = await Promise.all([
    db
      .select({ id: siteGroups.observedSiteId })
      .from(siteGroups)
      .where(and(inArray(siteGroups.leadSiteId, ofTheirGroups), eq(siteGroups.algorithmVersion, version))),
    db
      .select({ id: observationFlags.observedSiteId })
      .from(observationFlags)
      .where(
        and(
          isNull(observationFlags.closedReason),
          or(
            and(inArray(observationFlags.kind, [...MEMBER_LISTING_KINDS]), listsAnyOf(siteIds)),
            and(eq(observationFlags.kind, "renumbered"), inArray(observationFlags.stationId, theirStations)),
          ),
        ),
      ),
  ]);
  return unique([...siteIds, ...members.map((member) => member.id), ...flagged.map((flag) => flag.id)]);
}

async function raiseSiteKindFlags(tx: DbTx, sites: readonly ObservedSiteRecord[], settings: CrowdSettings): Promise<RaisedFlag[]> {
  const seenSince = daysAgo(SEEN_WITHIN_DAYS);
  const quietBefore = daysAgo(QUIET_FOR_DAYS);
  const { publicRadiusMaxM } = settings;
  const unmatched = sites.filter((site) => qualifiesAsUnmatched(site, { seenSince, publicRadiusMaxM }));
  const suggested = sites.filter((site) => isFlagSubject(site) && site.status === "suggested" && site.suggestedStationId !== null);
  const renumberable = sites.filter(
    (site) =>
      isFlagSubject(site) &&
      site.isConfirmed &&
      (site.rat === "LTE" || site.rat === "NR") &&
      (site.status === "unmatched" || site.status === "suggested"),
  );
  const inconsistent = sites.filter((site) => isFlagSubject(site) && site.isConfirmed && site.estimate !== null && !site.estimate.isConsistent);

  const [ownEstimates, places, cellInputs, placedCells, newSiteCells, renumberCandidates, registerLinks] = await Promise.all([
    loadOwnEstimates(tx, unmatched.flatMap(membersOf), settings.version),
    loadStationPlaces(tx, unique(sites.flatMap((site) => [site.suggestedStationId, site.matchedStationId]))),
    loadSiteCellInputs(tx, unique([...unmatched, ...suggested].flatMap(membersOf))),
    loadPlacedCells(
      tx,
      inconsistent.map((site) => site.id),
    ),
    loadNewSiteCells(
      tx,
      renumberable.map((site) => site.id),
    ),
    loadRenumberCandidates(tx, renumberable, Math.max(RENUMBERED_WITHIN_M, publicRadiusMaxM), quietBefore),
    loadRegisterLinks(tx, unmatched.flatMap(membersOf)),
  ]);
  const operatorIds = unique([...unmatched.map((site) => site.operatorId), ...[...places.values()].map((place) => place.operatorId)]);
  const countryCodes = unique([...unmatched.map((site) => site.countryCode), ...[...places.values()].map((place) => place.countryCode)]);
  const [mainCodes, plans, features] = await Promise.all([
    loadMainCodes(tx, operatorIds),
    loadBandPlans(countryCodes),
    getCountryFeaturesByCode(countryCodes, tx),
  ]);
  const cellsFor = (site: ObservedSiteRecord, operatorId: number | null, countryCode: string | null): MeasuredCell[] => {
    const station: NewCellStation = {
      ownerCode: operatorId === null ? undefined : mainCodes.get(operatorId),
      countryCode,
      planBands: countryCode === null ? [] : (plans.get(countryCode) ?? []),
      features: countryCode === null ? undefined : features.get(countryCode),
    };
    return buildSiteCells(cellInputs.cells, membersOf(site), station, cellInputs.context);
  };
  const unmatchedIds = new Set(unmatched.map((site) => site.id));
  const suggestionFor = (site: ObservedSiteRecord) => {
    if (!unmatchedIds.has(site.id) || site.operatorId === null || shiftOf(site, ownEstimates) !== null) return null;
    const memberIds = new Set(membersOf(site));
    const registered = registerNumberOf(
      registerLinks.filter((link) => memberIds.has(link.observedSiteId)),
      site.operatorId,
    );
    return suggestStation(site, cellsFor(site, site.operatorId, site.countryCode), registered?.siteId ?? null);
  };
  const matchFlagsOf = (site: ObservedSiteRecord) => {
    const suggestedPlace = site.suggestedStationId === null ? undefined : places.get(site.suggestedStationId);
    const matchedPlace = site.matchedStationId === null ? undefined : places.get(site.matchedStationId);
    const suggestedCells =
      suggestedPlace === undefined ? [] : cellsFor(site, suggestedPlace.operatorId, suggestedPlace.countryCode).map((measured) => measured.cell);
    return [
      raiseUnmatchedSiteFlag(site, { seenSince, publicRadiusMaxM, ownEstimates, suggestion: suggestionFor(site) }),
      raiseSuggestedSiteFlag(site, suggestedCells, suggestedPlace?.point ?? null),
      raisePositionDiffersFlag(site, matchedPlace?.point ?? null),
    ];
  };

  return sites.flatMap((site): RaisedFlag[] => {
    const renumbered = raiseRenumberedFlag(site, newSiteCells.get(site.id) ?? [], renumberCandidates, { quietBefore });
    const flags = renumbered === null ? matchFlagsOf(site) : [renumbered];
    return [...flags, raiseNodeSpansPlacesFlag(site, placedCells.get(site.id) ?? [])].flatMap((flag) => flag ?? []);
  });
}

function leadMoves(sites: readonly ObservedSiteRecord[]) {
  const sitesById = new Map(sites.map((site) => [site.id, site]));
  return sites.flatMap((site) => {
    const lead = site.group === null ? undefined : sitesById.get(site.group.leadSiteId);
    if (lead === undefined || lead.id === site.id || site.retiredAt !== null || site.copyOfObservedSiteId !== null) return [];
    return [{ fromSubjectKey: observedSiteSubject(site), toSubjectKey: observedSiteSubject(lead), observedSiteId: lead.id }];
  });
}

function sumCounts(counts: readonly FlagSyncCounts[]): FlagSyncCounts {
  return counts.reduce(
    (total, { opened, updated, resolved }) => ({
      opened: total.opened + opened,
      updated: total.updated + updated,
      resolved: total.resolved + resolved,
    }),
    NOTHING_SYNCED,
  );
}

async function refreshBatch(siteIds: readonly number[], settings: CrowdSettings, resolvedById: string | null): Promise<FlagSyncCounts> {
  const lookedAt = await expandSubjects(siteIds, settings.version);
  let sites = await loadObservedSites(lookedAt);
  if (await liftStaleIgnores(sites)) sites = await loadObservedSites(lookedAt);

  return db.transaction(async (tx) => {
    const raised = await raiseSiteKindFlags(tx, sites, settings);
    await moveFlags(tx, SITE_FLAG_KINDS, leadMoves(sites));
    const siteKinds = await syncFlags(tx, {
      kinds: SITE_FLAG_KINDS,
      lookedAt: inArray(observationFlags.observedSiteId, lookedAt),
      raised,
      fixed: or(flagsIn(fixedSiteFlags(sites)), and(eq(observationFlags.kind, "positionDiffers"), stationMovedSinceFlag())),
      resolvedById,
    });
    const siteIdKnown = await syncSiteIdFlags(tx, sites, lookedAt, resolvedById);
    const bearingDiffers = await syncBearingFlags(tx, lookedAt, resolvedById);
    return sumCounts([siteKinds, siteIdKnown, bearingDiffers]);
  });
}

async function refreshSites(siteIds: readonly number[], settings: CrowdSettings, resolvedById: string | null): Promise<FlagSyncCounts> {
  const counts: FlagSyncCounts[] = [];
  // oxlint-disable-next-line no-await-in-loop
  for (const part of chunks(unique(siteIds), SITES_PER_BATCH)) counts.push(await refreshBatch(part, settings, resolvedById));
  return sumCounts(counts);
}

export async function refreshSiteFlags(siteIds: readonly number[], resolvedById: string | null): Promise<void> {
  if (siteIds.length === 0) return;

  const startedAt = Date.now();
  const settings = await loadCrowdSettings();
  if (settings === undefined) return;

  const counts = await refreshSites(siteIds, settings, resolvedById);
  logger.info("observations.flags.site_refresh_finished", { sites: siteIds.length, ms: Date.now() - startedAt, counts });
}

async function findSitesToReview(since: Date | null, version: number): Promise<number[]> {
  const hasEstimate = db
    .select({ id: siteEstimates.observedSiteId })
    .from(siteEstimates)
    .where(and(eq(siteEstimates.observedSiteId, observationFlags.observedSiteId), eq(siteEstimates.algorithmVersion, version)));
  const gone = db
    .select({ id: observationFlags.observedSiteId })
    .from(observationFlags)
    .innerJoin(observedSites, eq(observedSites.id, observationFlags.observedSiteId))
    .where(
      and(
        isNull(observationFlags.closedReason),
        inArray(observationFlags.kind, [...SITE_FLAG_KINDS]),
        or(isNotNull(observedSites.retiredAt), notExists(hasEstimate)),
      ),
    );
  if (since === null) return unique((await gone).map((row) => row.id));

  const estimatedAfter = new Date(since.getTime() - ESTIMATE_MARGIN_MS);
  const [estimated, regrouped, edited, goneSites] = await Promise.all([
    db
      .select({ id: siteEstimates.observedSiteId })
      .from(siteEstimates)
      .where(and(eq(siteEstimates.algorithmVersion, version), gte(siteEstimates.estimatedAt, estimatedAfter))),
    db
      .select({ id: siteGroups.observedSiteId })
      .from(groupEstimates)
      .innerJoin(
        siteGroups,
        and(eq(siteGroups.leadSiteId, groupEstimates.leadSiteId), eq(siteGroups.algorithmVersion, groupEstimates.algorithmVersion)),
      )
      .where(and(eq(groupEstimates.algorithmVersion, version), gte(groupEstimates.estimatedAt, estimatedAfter))),
    db
      .select({ id: observationFlags.observedSiteId })
      .from(observationFlags)
      .leftJoin(stations, eq(stations.id, observationFlags.stationId))
      .leftJoin(locations, eq(locations.id, stations.location_id))
      .leftJoin(cells, eq(cells.id, observationFlags.cellId))
      .where(
        and(
          isNull(observationFlags.closedReason),
          inArray(observationFlags.kind, [...PASS_KINDS]),
          or(gte(stations.updatedAt, estimatedAfter), gte(locations.updatedAt, estimatedAfter), gte(cells.updatedAt, estimatedAfter)),
        ),
      ),
    gone,
  ]);
  return unique([...estimated, ...regrouped, ...edited, ...goneSites].map((row) => row.id));
}

export async function passSiteFlags(touchedSiteIds: readonly number[]): Promise<void> {
  const startedAt = new Date();
  const settings = await loadCrowdSettings();
  if (settings === undefined) return;

  const siteIds = unique([...touchedSiteIds, ...(await findSitesToReview(estimatedSince, settings.version))]);
  const counts = await refreshSites(siteIds, settings, null);
  estimatedSince = startedAt;
  if (siteIds.length > 0) {
    logger.info("observations.flags.site_pass_finished", { sites: siteIds.length, ms: Date.now() - startedAt.getTime(), counts });
  }
}
