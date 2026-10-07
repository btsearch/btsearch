import { countries, locations, operators, regions, stations } from "@openbts/drizzle";
import type { CountryFeatures } from "@openbts/shared/contract";
import { eq, inArray } from "drizzle-orm";

import db from "../../database/psql.js";
import type { DbTx } from "../../types/global.js";
import { type findPlacementCountryCode, placementCountryCode, stationCountryCode } from "./country.js";

type Reader = Pick<DbTx, "select">;
type Placement = Parameters<typeof findPlacementCountryCode>[0];

export const disabledCountryFeatures: Readonly<CountryFeatures> = { structureOwnerProposals: false, psc: false, bsic: false };

const featureColumns = {
  structureOwnerProposals: countries.structureOwnerProposals,
  psc: countries.psc,
  bsic: countries.bsic,
};

export async function getCountryFeaturesByCode(
  countryCodes: readonly (string | null | undefined)[],
  reader: Reader = db,
): Promise<Map<string, CountryFeatures>> {
  const codes = [...new Set(countryCodes.filter((code): code is string => typeof code === "string"))];
  if (codes.length === 0) return new Map();

  const rows = await reader
    .select({ code: countries.code, ...featureColumns })
    .from(countries)
    .where(inArray(countries.code, codes));
  return new Map(rows.map(({ code, ...features }) => [code, features]));
}

export async function getStationCountryFeatures(stationIds: readonly number[], reader: Reader = db): Promise<Map<number, CountryFeatures>> {
  const ids = [...new Set(stationIds)];
  if (ids.length === 0) return new Map();

  const rows = await reader
    .select({ stationId: stations.id, ...featureColumns })
    .from(stations)
    .leftJoin(locations, eq(locations.id, stations.location_id))
    .leftJoin(regions, eq(regions.id, locations.region_id))
    .leftJoin(operators, eq(operators.id, stations.operator_id))
    .leftJoin(countries, eq(countries.code, stationCountryCode))
    .where(inArray(stations.id, ids));
  return new Map(
    rows.map(({ stationId, structureOwnerProposals, psc, bsic }) => [
      stationId,
      { structureOwnerProposals: structureOwnerProposals ?? false, psc: psc ?? false, bsic: bsic ?? false },
    ]),
  );
}

export async function findPlacementCountryFeatures(placement: Placement, reader: Reader = db): Promise<CountryFeatures> {
  if (placement.stationId === null && typeof placement.regionId !== "number" && typeof placement.operatorId !== "number")
    return { ...disabledCountryFeatures };

  const [features] = await reader
    .select(featureColumns)
    .from(countries)
    .where(eq(countries.code, placementCountryCode(placement)))
    .limit(1);
  return features ?? { ...disabledCountryFeatures };
}
