import { cellMatches, cells, countries, locations, observedCells, operators, regions, stations } from "@openbts/drizzle";
import { type SQL, and, eq, exists, inArray, notInArray, or, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../../database/psql.js";
import { accessFromRequest } from "../../access/access.js";
import { hasStaffPermission } from "../../access/staff.js";
import { loadHiddenCountryCodes } from "../../countries/visibility.js";
import { stationCountryCode } from "../../stations/country.js";
import { ownDataUserId } from "../access.js";
import { observedSiteIdInArea, observedSiteIsPublic, observedSiteMeasuredBy, selectPublicSiteIds } from "../sites/visibility.js";

const matchedStationId = sql`coalesce(${cellMatches.stationId}, ${cells.station_id})`;

function stationsWhere(countryCondition: SQL) {
  return db
    .select({ id: stations.id })
    .from(stations)
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .leftJoin(regions, eq(regions.id, locations.region_id))
    .leftJoin(operators, eq(operators.id, stations.operator_id))
    .where(countryCondition);
}

function matchedToPublicStation(): SQL {
  const matched = db
    .select({ id: cellMatches.observedCellId })
    .from(cellMatches)
    .leftJoin(cells, eq(cells.id, cellMatches.cellId))
    .innerJoin(stations, eq(stations.id, matchedStationId))
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .leftJoin(regions, eq(regions.id, locations.region_id))
    .leftJoin(operators, eq(operators.id, stations.operator_id))
    .innerJoin(countries, eq(countries.code, stationCountryCode))
    .where(and(eq(cellMatches.observedCellId, observedCells.id), eq(countries.isVisible, true), eq(countries.observationsPublic, true)));
  return exists(matched);
}

export function isPublicObservedCell({ readsAllSitesOnce = false } = {}): SQL {
  const onPublicSite = readsAllSitesOnce
    ? inArray(observedCells.observedSiteId, selectPublicSiteIds())
    : observedSiteIsPublic(observedCells.observedSiteId);
  return sql`(${matchedToPublicStation()} OR ${onPublicSite})`;
}

export async function observedCellsVisibleTo(req: FastifyRequest): Promise<SQL | undefined> {
  if (await hasStaffPermission(req, { observations: ["manage"] })) return undefined;

  const [hiddenCountryCodes, staffAccess] = await Promise.all([
    loadHiddenCountryCodes(req),
    hasStaffPermission(req, { observations: ["moderate"] }).then((isStaff) => (isStaff ? accessFromRequest(req) : null)),
  ]);
  const userId = ownDataUserId(req);
  const ownSite = userId === null ? undefined : observedSiteMeasuredBy(userId, observedCells.observedSiteId);
  if (staffAccess === null) return or(isPublicObservedCell(), ownSite);

  const grantedCountryCodes = staffAccess.grants.map((grant) => grant.countryCode);
  const privateCountryCodes = db
    .select({ code: countries.code })
    .from(countries)
    .where(
      and(eq(countries.observationsPublic, false), grantedCountryCodes.length > 0 ? notInArray(countries.code, grantedCountryCodes) : undefined),
    );
  const matchedToVisibleStation = db
    .select({ id: cellMatches.observedCellId })
    .from(cellMatches)
    .leftJoin(cells, eq(cells.id, cellMatches.cellId))
    .where(
      and(
        eq(cellMatches.observedCellId, observedCells.id),
        hiddenCountryCodes.length > 0 ? notInArray(matchedStationId, stationsWhere(inArray(stationCountryCode, hiddenCountryCodes))) : undefined,
        notInArray(matchedStationId, stationsWhere(inArray(stationCountryCode, privateCountryCodes))),
      ),
    );
  return or(
    exists(matchedToVisibleStation),
    observedSiteIsPublic(observedCells.observedSiteId),
    observedSiteIdInArea(staffAccess.grants, observedCells.observedSiteId),
    ownSite,
  );
}
