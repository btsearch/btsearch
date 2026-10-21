import { capabilitiesFor } from "@openbts/country-packs";
import { locations, officialLocations, officialSites, operators, regions, stations } from "@openbts/drizzle";
import type { Bbox, EmfSiteReference } from "@openbts/shared/contract";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { assertCapabilityVisible, loadHiddenCountryCodes } from "../countries/visibility.js";
import { loadOfficialVisibility, officialLocationIsPublic } from "../official/visibility.js";
import { stationCountryCode } from "../stations/country.js";

export type EmfSite = { siteId: string; latitude: number; longitude: number; mnc: number | null };

const COORDINATE_PRECISION = 1000;
const SITE_BOX_REACH_DEGREES = 0.02;

function roundCoordinate(degrees: number): number {
  return Math.round(degrees * COORDINATE_PRECISION) / COORDINATE_PRECISION;
}

function toSite(siteId: string, latitude: number, longitude: number, mnc: number | null): EmfSite {
  return { siteId, latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude), mnc };
}

async function assertEmfCountry(req: FastifyRequest, countryCode: string): Promise<void> {
  if (!capabilitiesFor(countryCode).emf) throw new ErrorResponse("NOT_FOUND");
  if ((await loadHiddenCountryCodes(req)).includes(countryCode)) throw new ErrorResponse("NOT_FOUND");
}

async function stationSite(req: FastifyRequest, stationId: number): Promise<EmfSite | null> {
  const [row] = await db
    .select({
      siteId: stations.station_id,
      latitude: locations.latitude,
      longitude: locations.longitude,
      mnc: operators.mnc,
      countryCode: stationCountryCode,
    })
    .from(stations)
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .leftJoin(regions, eq(regions.id, locations.region_id))
    .leftJoin(operators, eq(operators.id, stations.operator_id))
    .where(eq(stations.id, stationId))
    .limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  if (row.countryCode === null) await assertCapabilityVisible(req, "emf");
  else await assertEmfCountry(req, row.countryCode);

  if (row.latitude === null || row.longitude === null) return null;
  return toSite(row.siteId, row.latitude, row.longitude, row.mnc);
}

async function officialSite(req: FastifyRequest, officialSiteId: number): Promise<EmfSite> {
  const visibility = await loadOfficialVisibility(req);
  const [row] = await db
    .select({
      siteId: officialSites.station_id,
      latitude: officialLocations.latitude,
      longitude: officialLocations.longitude,
      mnc: operators.mnc,
      countryCode: regions.countryCode,
    })
    .from(officialSites)
    .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
    .innerJoin(regions, eq(regions.id, officialLocations.region_id))
    .innerJoin(operators, eq(operators.id, officialSites.operator_id))
    .where(and(eq(officialSites.id, officialSiteId), officialLocationIsPublic(officialSites.location_id, visibility)))
    .limit(1);
  if (!row || row.siteId === null) throw new ErrorResponse("NOT_FOUND");
  await assertEmfCountry(req, row.countryCode);

  return toSite(row.siteId, row.latitude, row.longitude, row.mnc);
}

async function assertEmfPoint(req: FastifyRequest, latitude: number, longitude: number): Promise<void> {
  const [region] = await db
    .select({ countryCode: regions.countryCode })
    .from(regions)
    .where(eq(regions.id, sql`region_at(${longitude}, ${latitude})`))
    .limit(1);
  if (!region) throw new ErrorResponse("NOT_FOUND");
  await assertEmfCountry(req, region.countryCode);
}

async function operatorMnc(operatorId: number): Promise<number | null> {
  const [operator] = await db.select({ mnc: operators.mnc }).from(operators).where(eq(operators.id, operatorId)).limit(1);
  if (!operator) throw new ErrorResponse("NOT_FOUND", { message: "The operator does not exist." });
  return operator.mnc;
}

export async function resolveEmfSite(req: FastifyRequest, reference: EmfSiteReference): Promise<EmfSite | null> {
  if (reference.stationId !== undefined) return stationSite(req, reference.stationId);
  if (reference.officialSiteId !== undefined) return officialSite(req, reference.officialSiteId);

  const { siteId, latitude, longitude, operatorId } = reference;
  if (siteId === undefined || latitude === undefined || longitude === undefined) throw new ErrorResponse("BAD_REQUEST");
  await assertEmfPoint(req, latitude, longitude);
  return toSite(siteId, latitude, longitude, operatorId === undefined ? null : await operatorMnc(operatorId));
}

export function siteBox({ latitude, longitude }: EmfSite): Bbox {
  return [
    longitude - SITE_BOX_REACH_DEGREES,
    latitude - SITE_BOX_REACH_DEGREES,
    longitude + SITE_BOX_REACH_DEGREES,
    latitude + SITE_BOX_REACH_DEGREES,
  ];
}
