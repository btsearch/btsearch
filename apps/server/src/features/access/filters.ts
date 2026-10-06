import { locations, operators, proposedLocations, proposedStations, regions, stations } from "@openbts/drizzle";
import { type SQL, type SQLWrapper, inArray, or, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import { stationCountryCode, stationPlacementJoins, stationPlacementMatches } from "../stations/country.js";
import { type EditorGrant, accessFromRequest } from "./access.js";

const NO_REGION = sql`NULL::integer`;

function grantsCover(grants: readonly EditorGrant[], countryCode: SQLWrapper, regionId: SQLWrapper): SQL {
  const covered = grants.flatMap((grant) => {
    if (grant.isCountryWide) return [sql`${countryCode} = ${grant.countryCode}`];
    return grant.regionIds.length > 0 ? [inArray(regionId, grant.regionIds)] : [];
  });
  return or(...covered) ?? sql`false`;
}

export function stationInArea(grants: readonly EditorGrant[], stationId: SQLWrapper): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${stations}
    ${stationPlacementJoins}
    WHERE ${stations.id} = ${stationId}
    AND ${grantsCover(grants, stationCountryCode, locations.region_id)}
  )`;
}

function listedStationInArea(grants: readonly EditorGrant[]): SQL {
  return stationPlacementMatches(grantsCover(grants, stationCountryCode, locations.region_id));
}

function listedLocationInArea(grants: readonly EditorGrant[]): SQL {
  return grantsCover(grants, regions.countryCode, locations.region_id);
}

async function resolveEditableRows(req: FastifyRequest, inArea: (grants: readonly EditorGrant[]) => SQL): Promise<SQL | undefined> {
  const access = await accessFromRequest(req);
  if (access?.role === "admin") return undefined;
  return inArea(access?.grants ?? []);
}

export function resolveEditableStations(req: FastifyRequest): Promise<SQL | undefined> {
  return resolveEditableRows(req, listedStationInArea);
}

export function resolveEditableLocations(req: FastifyRequest): Promise<SQL | undefined> {
  return resolveEditableRows(req, listedLocationInArea);
}

export function proposedLocationInArea(grants: readonly EditorGrant[], submissionId: SQLWrapper): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${proposedLocations}
    INNER JOIN ${regions} ON ${regions.id} = ${proposedLocations.region_id}
    WHERE ${proposedLocations.submission_id} = ${submissionId}
    AND ${grantsCover(grants, regions.countryCode, proposedLocations.region_id)}
  )`;
}

export function unplacedProposedStationInArea(grants: readonly EditorGrant[], submissionId: SQLWrapper): SQL {
  return sql`EXISTS (
    SELECT 1 FROM ${proposedStations}
    INNER JOIN ${operators} ON ${operators.id} = ${proposedStations.operator_id}
    WHERE ${proposedStations.submission_id} = ${submissionId}
    AND NOT EXISTS (SELECT 1 FROM ${proposedLocations} WHERE ${proposedLocations.submission_id} = ${submissionId})
    AND ${grantsCover(grants, operators.countryCode, NO_REGION)}
  )`;
}
