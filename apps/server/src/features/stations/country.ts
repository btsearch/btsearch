import { locations, operators, regions, stations } from "@openbts/drizzle";
import { type SQL, eq, sql } from "drizzle-orm";

import db from "../../database/psql.js";
import type { DbTx } from "../../types/global.js";

type Placement = { stationId: number | null; regionId?: number | null; operatorId?: number | null };
type Reader = Pick<DbTx, "select">;

export const stationCountryCode = sql<string | null>`COALESCE(${regions.countryCode}, ${operators.countryCode})`;

export const stationPlacementJoins = sql`LEFT JOIN ${locations} ON ${locations.id} = ${stations.location_id}
    LEFT JOIN ${regions} ON ${regions.id} = ${locations.region_id}
    LEFT JOIN ${operators} ON ${operators.id} = ${stations.operator_id}`;

export const stationCountries = {
  table: sql`(
    SELECT ${stations.id} AS station_id, ${stationCountryCode} AS country_code
    FROM ${stations}
    ${stationPlacementJoins}
  ) AS station_countries`,
  stationId: sql<number>`station_countries.station_id`,
  countryCode: sql<string | null>`station_countries.country_code`,
};

export function stationPlacementMatches(condition: SQL): SQL {
  return sql`${stations.id} IN (SELECT ${stations.id} FROM ${stations} ${stationPlacementJoins} WHERE ${condition})`;
}

export async function findPlacementCountryCode({ stationId, regionId, operatorId }: Placement, reader: Reader = db): Promise<string | null> {
  const [[region], [station], [operator]] = await Promise.all([
    typeof regionId === "number" ? reader.select({ countryCode: regions.countryCode }).from(regions).where(eq(regions.id, regionId)).limit(1) : [],
    stationId === null
      ? []
      : reader
          .select({ locationCountry: regions.countryCode, operatorCountry: operators.countryCode })
          .from(stations)
          .leftJoin(locations, eq(locations.id, stations.location_id))
          .leftJoin(regions, eq(regions.id, locations.region_id))
          .leftJoin(operators, eq(operators.id, stations.operator_id))
          .where(eq(stations.id, stationId))
          .limit(1),
    typeof operatorId === "number"
      ? reader.select({ countryCode: operators.countryCode }).from(operators).where(eq(operators.id, operatorId)).limit(1)
      : [],
  ]);
  return region?.countryCode ?? station?.locationCountry ?? operator?.countryCode ?? station?.operatorCountry ?? null;
}
