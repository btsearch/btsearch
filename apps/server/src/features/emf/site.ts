import { locations, operators, regions, stations, ukeLocations, ukeStations } from "@openbts/drizzle";
import type { Bbox, EmfSiteReference } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { loadHiddenCountryCodes } from "../countries/visibility.js";
import { stationCountryCode } from "../stations/country.js";
import { EMF_COUNTRY_CODE } from "./si2pem.js";

export type EmfSite = { siteId: string; latitude: number; longitude: number; mnc: number | null };

const COORDINATE_PRECISION = 1000;
const SITE_BOX_REACH_DEGREES = 0.02;

function roundCoordinate(degrees: number): number {
  return Math.round(degrees * COORDINATE_PRECISION) / COORDINATE_PRECISION;
}

function toSite(siteId: string, latitude: number, longitude: number, mnc: number | null): EmfSite {
  return { siteId, latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude), mnc };
}

export async function assertEmfCountryVisible(req: FastifyRequest): Promise<void> {
  if ((await loadHiddenCountryCodes(req)).includes(EMF_COUNTRY_CODE)) throw new ErrorResponse("NOT_FOUND");
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
  if (row.countryCode !== null && row.countryCode !== EMF_COUNTRY_CODE) throw new ErrorResponse("NOT_FOUND");
  await assertEmfCountryVisible(req);

  if (row.latitude === null || row.longitude === null) return null;
  return toSite(row.siteId, row.latitude, row.longitude, row.mnc);
}

async function officialSite(req: FastifyRequest, officialSiteId: number): Promise<EmfSite> {
  const [row] = await db
    .select({ siteId: ukeStations.station_id, latitude: ukeLocations.latitude, longitude: ukeLocations.longitude, mnc: operators.mnc })
    .from(ukeStations)
    .innerJoin(ukeLocations, eq(ukeLocations.id, ukeStations.location_id))
    .innerJoin(operators, eq(operators.id, ukeStations.operator_id))
    .where(eq(ukeStations.id, officialSiteId))
    .limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  await assertEmfCountryVisible(req);

  return toSite(row.siteId, row.latitude, row.longitude, row.mnc);
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
  await assertEmfCountryVisible(req);
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
