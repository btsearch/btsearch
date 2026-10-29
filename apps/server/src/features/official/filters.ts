import {
  microwaveLinks,
  officialDatasets,
  officialLocations,
  officialPermitListings,
  officialPermits,
  officialSites,
  officialSources,
  regions,
  stations,
  stationsOfficialSites,
} from "@openbts/drizzle";
import type { OfficialLocationListQuery, OfficialPermitKind, OfficialRatFilter, officialSiteFilterShape } from "@openbts/shared/contract";
import { type AnyColumn, type SQL, type SQLWrapper, and, eq, exists, gte, inArray, isNull, notInArray, or, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import { operatedBy, outsideCountriesOf } from "../operators/sharing.js";
import { containsPattern } from "../search/text.js";
import { bboxCondition, stationAreaConditions } from "../stations/read.js";
import { DATASET_PERMIT_KINDS, type DatasetPermitKind, type OfficialPermitRow } from "./serialize.js";
import { type OfficialVisibility, officialSourceIsPublic } from "./visibility.js";

type SiteFilterQuery = Pick<OfficialLocationListQuery, keyof typeof officialSiteFilterShape> & { keepOtherCountries?: boolean };
type AreaFilterQuery = Pick<OfficialLocationListQuery, "bbox" | "countryCodes" | "regionIds" | "sourceKeys">;
type LabelFilterQuery = Pick<OfficialLocationListQuery, "rats" | "bandLabels">;
type StoredTechnology = { rat: NonNullable<OfficialPermitRow["rat"]>; variant?: NonNullable<OfficialPermitRow["label_variant"]> };

const SIMILAR_PERMIT_NUMBER = 0.6;
const TECHNOLOGIES: Record<OfficialRatFilter, StoredTechnology> = {
  gsm: { rat: "GSM", variant: "commercial" },
  gsmR: { rat: "GSM", variant: "railway" },
  umts: { rat: "UMTS" },
  lte: { rat: "LTE" },
  nr: { rat: "NR" },
  cdma: { rat: "CDMA" },
  iot: { rat: "IOT" },
};
const DECISION_TYPES: Partial<Record<OfficialPermitKind, OfficialPermitRow["decision_type"]>> = { permit: "permit", permitChange: "permit_change" };

function technologyCondition(filter: OfficialRatFilter): SQL | undefined {
  const { rat, variant } = TECHNOLOGIES[filter];
  const isRat = eq(officialPermits.rat, rat);
  return variant === undefined ? isRat : and(isRat, eq(officialPermits.label_variant, variant));
}

export function permitLabelCondition({ rats, bandLabels }: LabelFilterQuery): SQL | undefined {
  return and(rats ? or(...rats.map(technologyCondition)) : undefined, bandLabels ? inArray(officialPermits.label_mhz, bandLabels) : undefined);
}

export function linkedToStations(officialSiteId: SQLWrapper, stationIds: readonly number[], hiddenCountryCodes: readonly string[]): SQL {
  const conditions = [
    eq(stationsOfficialSites.official_site_id, officialSiteId),
    inArray(stationsOfficialSites.station_id, [...stationIds]),
    ...stationAreaConditions({}, hiddenCountryCodes),
  ];
  return exists(
    db
      .select({ id: stationsOfficialSites.station_id })
      .from(stationsOfficialSites)
      .innerJoin(stations, eq(stations.id, stationsOfficialSites.station_id))
      .where(and(...conditions)),
  );
}

export function hasMatchingPermit(condition: SQL): SQL {
  return exists(
    db
      .select({ id: officialPermits.id })
      .from(officialPermits)
      .where(and(eq(officialPermits.official_site_id, officialSites.id), condition)),
  );
}

export function officialAreaConditions(query: AreaFilterQuery, visibility: OfficialVisibility): SQL[] {
  const conditions: SQL[] = [];
  const fromPublicSource = officialSourceIsPublic(officialLocations.source_id, visibility);

  if (fromPublicSource) conditions.push(fromPublicSource);
  if (visibility.hiddenCountryCodes.length > 0) conditions.push(notInArray(regions.countryCode, [...visibility.hiddenCountryCodes]));
  if (query.bbox) conditions.push(bboxCondition(officialLocations.point, query.bbox));
  if (query.regionIds) conditions.push(inArray(officialLocations.region_id, query.regionIds));
  if (query.countryCodes) conditions.push(inArray(regions.countryCode, query.countryCodes));
  if (query.sourceKeys) conditions.push(inArray(officialSources.key, query.sourceKeys));
  return conditions;
}

function siteOperatorCondition(operatorIds: readonly number[], keepsOtherCountries: boolean): SQL {
  const operated = operatedBy(officialSites.operator_id, operatorIds);
  return keepsOtherCountries ? sql`(${operated} OR ${outsideCountriesOf(regions.countryCode, operatorIds)})` : operated;
}

export function officialSiteConditions(query: SiteFilterQuery, listedSiteIds: readonly number[] | null): SQL[] {
  const conditions: SQL[] = [];
  const labelMatch = permitLabelCondition(query);

  if (query.operatorIds) conditions.push(siteOperatorCondition(query.operatorIds, query.keepOtherCountries === true));
  if (labelMatch) conditions.push(hasMatchingPermit(labelMatch));
  if (query.createdAfter) conditions.push(gte(officialSites.createdAt, new Date(query.createdAfter)));
  if (query.updatedAfter) conditions.push(gte(officialSites.updatedAt, new Date(query.updatedAfter)));
  if (query.changedAfter) {
    const after = new Date(query.changedAfter);
    conditions.push(sql`(${gte(officialSites.createdAt, after)} OR ${gte(officialSites.updatedAt, after)})`);
  }
  if (listedSiteIds) conditions.push(inArray(officialSites.id, [...listedSiteIds]));
  return conditions;
}

export function permitNumberMatches(number: AnyColumn, text: string): SQL {
  return sql`(${number} ILIKE ${containsPattern(text)} OR (${number} % ${text} AND similarity(${number}, ${text}) > ${SIMILAR_PERMIT_NUMBER}))`;
}

function permitKindMatches(decisionType: AnyColumn, kinds: readonly OfficialPermitKind[]): SQL {
  const decisionTypes = unique(kinds.flatMap((kind) => DECISION_TYPES[kind] ?? []));
  return decisionTypes.length === 0 ? sql`false` : inArray(decisionType, decisionTypes);
}

function datasetKindsOf(kinds: readonly OfficialPermitKind[]): DatasetPermitKind[] {
  return (Object.keys(DATASET_PERMIT_KINDS) as DatasetPermitKind[]).filter((datasetKind) => kinds.includes(DATASET_PERMIT_KINDS[datasetKind]));
}

export function decisionOrDatasetKindMatches(kinds: readonly OfficialPermitKind[]): SQL {
  const datasetKinds = datasetKindsOf(kinds);
  const listedUnderKind = exists(
    db
      .select({ permitId: officialPermitListings.permitId })
      .from(officialPermitListings)
      .innerJoin(officialDatasets, eq(officialDatasets.id, officialPermitListings.datasetId))
      .where(and(eq(officialPermitListings.permitId, officialPermits.id), inArray(officialDatasets.permitKind, datasetKinds))),
  );
  const undecidedListedUnderKind = datasetKinds.length > 0 ? and(isNull(officialPermits.decision_type), listedUnderKind) : undefined;
  return or(permitKindMatches(officialPermits.decision_type, kinds), undecidedListedUnderKind) ?? sql`false`;
}

export function linkKindMatches(kinds: readonly OfficialPermitKind[]): SQL {
  const datasetKinds = datasetKindsOf(kinds);
  const undecidedOfKind =
    datasetKinds.length > 0 ? and(isNull(microwaveLinks.decision_type), inArray(officialDatasets.permitKind, datasetKinds)) : undefined;
  return or(permitKindMatches(microwaveLinks.decision_type, kinds), undecidedOfKind) ?? sql`false`;
}
