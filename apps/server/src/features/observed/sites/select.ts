import {
  cellContributors,
  cellCopies,
  contributorBlocks,
  countries,
  crowdSettings,
  deviceRevocations,
  deviceTiers,
  devices,
  groupEstimates,
  locations,
  observedCells,
  observedSites,
  officialLocations,
  officialSites,
  operators,
  regions,
  siteConfirmations,
  siteCopies,
  siteEstimates,
  siteGroups,
  siteIgnores,
  siteLinks,
  snapTests,
  users,
  vouches,
} from "@openbts/drizzle";
import type { ObservedSiteStatus } from "@openbts/shared/contract";
import { type SQL, type SQLWrapper, and, asc, desc, eq, gte, isNotNull, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import db from "../../../database/psql.js";
import { inForce } from "../../measurements/contributors/eligibility.js";
import { CONFIRMING_PEOPLE, CONFIRMING_TRIPS } from "../cells/confirmation.js";
import { selectReportedCodes } from "../networks.js";
import { publicRule } from "./publicRule.js";

export const SETTINGS_ROW_ID = 1;

const primaryLink = alias(siteLinks, "primary_link");
const snapLocation = alias(locations, "snap_location");
const snapOfficialSite = alias(officialSites, "snap_official_site");
const snapOfficialLocation = alias(officialLocations, "snap_official_location");
const ownEstimate = alias(siteEstimates, "own_estimate");
const otherEstimate = alias(siteEstimates, "other_estimate");
const linkedMember = alias(siteGroups, "linked_member");
const memberLink = alias(siteLinks, "member_link");
const confirmingMember = alias(siteGroups, "confirming_member");
const confirmingCell = alias(observedCells, "confirming_cell");
const ignorer = alias(users, "ignorer");
const linker = alias(users, "linker");
const networkCountry = alias(countries, "network_country");

const publishedVersion = crowdSettings.publishedAlgorithmVersion;

function groupOrOwnEstimate<T = unknown>(groupValue: SQLWrapper, ownValue: SQLWrapper): SQL<T> {
  return sql<T>`CASE WHEN ${groupEstimates.leadSiteId} IS NOT NULL THEN ${groupValue} ELSE ${ownValue} END`;
}

function selectGroupCells() {
  const isOfGroup = and(eq(confirmingMember.leadSiteId, siteGroups.leadSiteId), eq(confirmingMember.algorithmVersion, siteGroups.algorithmVersion));
  const ownCells = db
    .select({ id: confirmingCell.id })
    .from(confirmingMember)
    .innerJoin(confirmingCell, eq(confirmingCell.observedSiteId, confirmingMember.observedSiteId))
    .leftJoin(cellCopies, eq(cellCopies.observedCellId, confirmingCell.id))
    .where(and(isOfGroup, isNull(cellCopies.observedCellId)));
  const copiedCells = db
    .select({ id: cellCopies.observedCellId })
    .from(confirmingMember)
    .innerJoin(confirmingCell, eq(confirmingCell.observedSiteId, confirmingMember.observedSiteId))
    .innerJoin(cellCopies, eq(cellCopies.primaryCellId, confirmingCell.id))
    .where(isOfGroup);
  return ownCells.unionAll(copiedCells).as("group_cell");
}

function selectGroupConfirmation() {
  const groupCells = selectGroupCells();
  const seenOnTripsByStrongPhone = and(gte(cellContributors.tripCount, CONFIRMING_TRIPS), eq(deviceTiers.tier, "strong"));
  return db
    .select({
      isConfirmed: sql<boolean>`coalesce(
        (count(DISTINCT ${devices.userId}) >= ${CONFIRMING_PEOPLE} AND min(${cellContributors.firstSeenOn}) < max(${cellContributors.lastSeenOn}))
        OR bool_or(${vouches.userId} IS NOT NULL)
        OR bool_or(${seenOnTripsByStrongPhone}),
        false
      )`.as("is_confirmed"),
    })
    .from(groupCells)
    .innerJoin(cellContributors, eq(cellContributors.observedCellId, groupCells.id))
    .innerJoin(devices, and(eq(devices.id, cellContributors.deviceId), isNotNull(devices.userId)))
    .innerJoin(deviceTiers, eq(deviceTiers.deviceId, devices.id))
    .leftJoin(deviceRevocations, eq(deviceRevocations.deviceId, devices.id))
    .leftJoin(contributorBlocks, and(eq(contributorBlocks.userId, devices.userId), inForce(contributorBlocks.until)))
    .leftJoin(vouches, and(eq(vouches.userId, devices.userId), vouches.confirmsAlone, or(isNull(vouches.until), sql`${vouches.until} > now()`)))
    .where(and(isNull(deviceRevocations.deviceId), isNull(contributorBlocks.userId)))
    .as("group_confirmation");
}

function selectGroupLink() {
  return db
    .select({ kind: memberLink.kind, stationId: memberLink.stationId, linkedById: memberLink.linkedById, linkedAt: memberLink.linkedAt })
    .from(linkedMember)
    .innerJoin(memberLink, eq(memberLink.observedSiteId, linkedMember.observedSiteId))
    .where(and(eq(linkedMember.leadSiteId, siteGroups.leadSiteId), eq(linkedMember.algorithmVersion, siteGroups.algorithmVersion)))
    .orderBy(
      desc(sql`${memberLink.kind} = 'matched'`),
      desc(sql`${linkedMember.observedSiteId} = ${linkedMember.leadSiteId}`),
      asc(linkedMember.observedSiteId),
    )
    .limit(1)
    .as("group_link");
}

function selectCopyOf() {
  return db
    .select({ primarySiteId: siteCopies.primarySiteId })
    .from(siteCopies)
    .where(and(eq(siteCopies.observedSiteId, observedSites.id), isNull(observedSites.retiredAt)))
    .as("copy_of");
}

export function selectObservedSites() {
  const copyOf = selectCopyOf();
  const groupLink = selectGroupLink();
  const groupConfirmation = selectGroupConfirmation();
  const network = selectReportedCodes();

  const primarySiteId = sql<number>`coalesce(${copyOf.primarySiteId}, ${observedSites.id})`;
  const point = groupOrOwnEstimate(groupEstimates.point, ownEstimate.point);
  const alternativePoint = groupOrOwnEstimate(groupEstimates.alternativePoint, ownEstimate.alternativePoint);
  const uncertaintyM = groupOrOwnEstimate<number>(groupEstimates.uncertaintyM, ownEstimate.uncertaintyM);
  const isConsistent = groupOrOwnEstimate<boolean>(groupEstimates.isConsistent, ownEstimate.isConsistent);
  const personCount = groupOrOwnEstimate<number>(groupEstimates.personCount, ownEstimate.personCount);
  const maxDistanceM = groupOrOwnEstimate<number>(groupEstimates.maxDistanceM, ownEstimate.maxDistanceM);
  const snapLatitude = sql<number | null>`coalesce(${snapLocation.latitude}, ${snapOfficialLocation.latitude}, ST_Y(${otherEstimate.point}))`;
  const snapLongitude = sql<number | null>`coalesce(${snapLocation.longitude}, ${snapOfficialLocation.longitude}, ST_X(${otherEstimate.point}))`;
  const shownRegionId = sql<number | null>`CASE
    WHEN ${snapLocation.id} IS NOT NULL THEN ${snapLocation.region_id}
    WHEN ${snapOfficialLocation.id} IS NOT NULL THEN ${snapOfficialLocation.region_id}
    WHEN ${otherEstimate.observedSiteId} IS NOT NULL THEN ${otherEstimate.regionId}
    ELSE ${groupOrOwnEstimate(groupEstimates.regionId, ownEstimate.regionId)}
  END`;
  const isGrouped = sql`${siteGroups.leadSiteId} IS NOT NULL`;
  const linkKind = sql`CASE WHEN ${isGrouped} THEN ${groupLink.kind} ELSE ${primaryLink.kind} END`;
  const linkStationId = sql<number | null>`CASE WHEN ${isGrouped} THEN ${groupLink.stationId} ELSE ${primaryLink.stationId} END`;
  const linkedById = sql`CASE WHEN ${isGrouped} THEN ${groupLink.linkedById} ELSE ${primaryLink.linkedById} END`;
  const linkedAt = sql`CASE WHEN ${isGrouped} THEN ${groupLink.linkedAt} ELSE ${primaryLink.linkedAt} END`.mapWith(siteLinks.linkedAt);
  const status = sql<ObservedSiteStatus>`CASE
    WHEN ${observedSites.retiredAt} IS NOT NULL THEN 'replaced'
    WHEN ${siteIgnores.observedSiteId} IS NOT NULL THEN 'ignored'
    ELSE coalesce(${linkKind}::text, 'unmatched')
  END`;
  const isConfirmed = sql<boolean>`CASE WHEN ${isGrouped} THEN ${groupConfirmation.isConfirmed} ELSE ${siteConfirmations.observedSiteId} IS NOT NULL END`;
  const countryCode = sql<string | null>`coalesce(${regions.countryCode}, ${operators.countryCode})`;
  const isCountryShown = sql<boolean>`(
    coalesce(${countries.isVisible} AND ${countries.observationsPublic}, false)
    AND coalesce(${networkCountry.isVisible} AND ${networkCountry.observationsPublic}, false)
  )`;
  const { isPublic, notPublicReasons } = publicRule({
    retiredAt: observedSites.retiredAt,
    status,
    point,
    alternativePoint,
    isConfirmed,
    isConsistent,
    isSnapped: sql`${snapTests.probability} IS NOT NULL AND ${snapLatitude} IS NOT NULL`,
    snapProbability: snapTests.probability,
    uncertaintyM,
    publicRadiusMaxM: crowdSettings.publicRadiusMaxM,
    maxDistanceM,
    isCountryShown,
  });

  const query = db
    .select({
      id: observedSites.id,
      plmn: observedSites.plmn,
      rat: observedSites.rat,
      nodeId: observedSites.nodeId,
      stationId: observedSites.stationId,
      retiredAt: observedSites.retiredAt,
      primarySiteId,
      copyOfObservedSiteId: copyOf.primarySiteId,
      leadSiteId: siteGroups.leadSiteId,
      algorithmVersion: publishedVersion,
      estimateOf: sql<"group" | "site" | null>`CASE
        WHEN ${groupEstimates.leadSiteId} IS NOT NULL THEN 'group'
        WHEN ${ownEstimate.observedSiteId} IS NOT NULL THEN 'site'
      END`,
      calibrationRunId: groupOrOwnEstimate<number | null>(groupEstimates.calibrationRunId, ownEstimate.calibrationRunId),
      estimatedAt: groupOrOwnEstimate(groupEstimates.estimatedAt, ownEstimate.estimatedAt).mapWith(siteEstimates.estimatedAt),
      latitude: sql<number>`ST_Y(${point})`,
      longitude: sql<number>`ST_X(${point})`,
      uncertaintyM,
      ellipseMajorM: groupOrOwnEstimate<number>(groupEstimates.ellipseMajorM, ownEstimate.ellipseMajorM),
      ellipseMinorM: groupOrOwnEstimate<number>(groupEstimates.ellipseMinorM, ownEstimate.ellipseMinorM),
      ellipseAzimuthDeg: groupOrOwnEstimate<number>(groupEstimates.ellipseAzimuthDeg, ownEstimate.ellipseAzimuthDeg),
      alternativeLatitude: sql<number | null>`ST_Y(${alternativePoint})`,
      alternativeLongitude: sql<number | null>`ST_X(${alternativePoint})`,
      isConsistent,
      sampleCount: groupOrOwnEstimate<string>(groupEstimates.sampleCount, ownEstimate.sampleCount),
      contributorCount: groupOrOwnEstimate<number>(groupEstimates.contributorCount, ownEstimate.contributorCount),
      personCount,
      binCount: groupOrOwnEstimate<number>(groupEstimates.binCount, ownEstimate.binCount),
      taSampleCount: groupOrOwnEstimate<string>(groupEstimates.taSampleCount, ownEstimate.taSampleCount),
      angularCoverageDeg: groupOrOwnEstimate<number>(groupEstimates.angularCoverageDeg, ownEstimate.angularCoverageDeg),
      distinctDays: groupOrOwnEstimate<number>(groupEstimates.distinctDays, ownEstimate.distinctDays),
      maxDistanceM,
      snapLocationId: snapTests.locationId,
      snapOfficialSiteId: snapTests.officialSiteId,
      snapObservedSiteId: snapTests.otherSiteId,
      snapProbability: snapTests.probability,
      snapLatitude,
      snapLongitude,
      snapCity: sql<string | null>`coalesce(${snapLocation.city}, ${snapOfficialLocation.city})`,
      snapAddress: sql<string | null>`coalesce(${snapLocation.address}, ${snapOfficialLocation.address})`,
      status,
      linkStationId,
      linkedBy: { id: linker.id, username: linker.username, name: linker.name, image: linker.image },
      linkedAt,
      ignore: { reason: siteIgnores.reason, at: siteIgnores.ignoredAt },
      ignoredBy: { id: ignorer.id, username: ignorer.username, name: ignorer.name, image: ignorer.image },
      isConfirmed,
      notPublicReasons,
      isCountryShown,
      countryCode,
      regionId: regions.id,
      siteId: sql<number>`${observedSites.id}`.as("site_id"),
      siteKey: sql<number>`coalesce(${siteGroups.leadSiteId}, ${primarySiteId})`.as("site_key"),
      siteStatus: sql<ObservedSiteStatus>`${status}`.as("site_status"),
      networkCountryCode: sql<string | null>`${operators.countryCode}`.as("network_country_code"),
    })
    .from(observedSites)
    .innerJoin(crowdSettings, eq(crowdSettings.id, SETTINGS_ROW_ID))
    .leftJoinLateral(copyOf, sql`true`)
    .leftJoin(primaryLink, eq(primaryLink.observedSiteId, primarySiteId))
    .leftJoin(
      siteGroups,
      and(
        eq(siteGroups.observedSiteId, primarySiteId),
        eq(siteGroups.algorithmVersion, publishedVersion),
        isNull(observedSites.retiredAt),
        sql`${primaryLink.kind} IS DISTINCT FROM 'matched'`,
      ),
    )
    .leftJoin(groupEstimates, and(eq(groupEstimates.leadSiteId, siteGroups.leadSiteId), eq(groupEstimates.algorithmVersion, publishedVersion)))
    .leftJoin(ownEstimate, and(eq(ownEstimate.observedSiteId, primarySiteId), eq(ownEstimate.algorithmVersion, publishedVersion)))
    .leftJoin(
      snapTests,
      and(
        eq(snapTests.observedSiteId, sql`coalesce(${siteGroups.leadSiteId}, ${primarySiteId})`),
        eq(snapTests.algorithmVersion, publishedVersion),
        snapTests.isSnap,
        isNull(snapTests.candidateId),
      ),
    )
    .leftJoin(snapLocation, eq(snapLocation.id, snapTests.locationId))
    .leftJoin(snapOfficialSite, eq(snapOfficialSite.id, snapTests.officialSiteId))
    .leftJoin(snapOfficialLocation, eq(snapOfficialLocation.id, snapOfficialSite.location_id))
    .leftJoin(otherEstimate, and(eq(otherEstimate.observedSiteId, snapTests.otherSiteId), eq(otherEstimate.algorithmVersion, publishedVersion)))
    .leftJoinLateral(groupLink, sql`true`)
    .leftJoinLateral(groupConfirmation, sql`true`)
    .leftJoin(linker, eq(linker.id, linkedById))
    .leftJoin(siteIgnores, eq(siteIgnores.observedSiteId, primarySiteId))
    .leftJoin(ignorer, eq(ignorer.id, siteIgnores.ignoredById))
    .leftJoin(siteConfirmations, eq(siteConfirmations.observedSiteId, primarySiteId))
    .leftJoin(network, eq(network.reportedCode, observedSites.plmn))
    .leftJoin(operators, eq(operators.id, network.operatorId))
    .leftJoin(networkCountry, eq(networkCountry.code, operators.countryCode))
    .leftJoin(regions, eq(regions.id, shownRegionId))
    .leftJoin(countries, eq(countries.code, countryCode));

  return {
    query,
    point,
    primarySiteId,
    leadSiteId: siteGroups.leadSiteId,
    copyOfSiteId: copyOf.primarySiteId,
    status,
    isPublic,
    isCountryShown,
    countryCode,
    regionId: regions.id,
    personCount,
  };
}

export type ObservedSiteSelection = ReturnType<typeof selectObservedSites>;
export type ObservedSiteRow = Awaited<ObservedSiteSelection["query"]>[number];
