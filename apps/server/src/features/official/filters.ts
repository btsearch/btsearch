import { officialLocations, officialPermits, officialSites, officialSources, regions, stations, stationsPermits } from "@openbts/drizzle";
import type { OfficialLocationListQuery, OfficialPermitKind, OfficialRatFilter, officialSiteFilterShape } from "@openbts/shared/contract";
import { type AnyColumn, type SQL, type SQLWrapper, and, eq, exists, gte, inArray, notInArray, or, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import { unique } from "../../lib/collections.js";
import { operatedBy, outsideCountriesOf } from "../operators/sharing.js";
import { containsPattern } from "../search/text.js";
import { bboxCondition, stationAreaConditions } from "../stations/read.js";
import type { OfficialPermitRow } from "./serialize.js";
import { type OfficialVisibility, officialSourceIsPublic } from "./visibility.js";

type SiteFilterQuery = Pick<OfficialLocationListQuery, keyof typeof officialSiteFilterShape> & { keepOtherCountries?: boolean };
type AreaFilterQuery = Pick<OfficialLocationListQuery, "bbox" | "countryCodes" | "regionIds" | "sourceKeys">;
type LabelFilterQuery = Pick<OfficialLocationListQuery, "rats" | "bandLabels">;
type StoredTechnology = { rat: OfficialPermitRow["rat"]; variant?: OfficialPermitRow["label_variant"] };

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

export function linkedToStations(permitId: SQLWrapper, stationIds: readonly number[], hiddenCountryCodes: readonly string[]): SQL {
  const conditions = [
    eq(stationsPermits.permit_id, permitId),
    inArray(stationsPermits.station_id, [...stationIds]),
    ...stationAreaConditions({}, hiddenCountryCodes),
  ];
  return exists(
    db
      .select({ id: stationsPermits.id })
      .from(stationsPermits)
      .innerJoin(stations, eq(stations.id, stationsPermits.station_id))
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

export function permitKindMatches(decisionType: AnyColumn, kinds: readonly OfficialPermitKind[]): SQL {
  return inArray(decisionType, unique(kinds.map((kind) => DECISION_TYPES[kind])));
}
