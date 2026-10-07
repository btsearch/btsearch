import { regionLookup, regions } from "@openbts/drizzle";
import type { Bbox } from "@openbts/shared/contract";
import { type SQL, inArray, sql } from "drizzle-orm";

import db from "../../database/psql.js";

export type RegionPoint = { longitude: number; latitude: number; regionId?: number | null };

export async function findRegionIdsAt(points: readonly RegionPoint[]): Promise<(number | null)[]> {
  if (points.length === 0) return [];

  const values = points.map(
    ({ longitude, latitude, regionId }, ordinal) =>
      sql`(${ordinal}::integer, ${longitude}::double precision, ${latitude}::double precision, ${regionId ?? null}::integer)`,
  );
  const rows = await db.execute<{ regionId: number | null }>(sql`
    SELECT COALESCE(region_at(given.longitude, given.latitude, given.claimed), given.claimed) AS "regionId"
    FROM (VALUES ${sql.join(values, sql`, `)}) AS given (ordinal, longitude, latitude, claimed)
    ORDER BY given.ordinal
  `);
  return rows.map((row) => row.regionId);
}

export async function findRegionIdAt(point: RegionPoint): Promise<number | null> {
  const [regionId] = await findRegionIdsAt([point]);
  return regionId ?? null;
}

export function outlineTouches([west, south, east, north]: Bbox): SQL {
  const between = (from: number, to: number) => sql`ST_Intersects(${regionLookup.geom}, ST_MakeEnvelope(${from}, ${south}, ${to}, ${north}, 4326))`;
  const pieceTouchesBox = west < east ? between(west, east) : sql`(${between(west, 180)} OR ${between(-180, east)})`;
  const touchingRegionIds = db.select({ regionId: regionLookup.regionId }).from(regionLookup).where(pieceTouchesBox);

  return inArray(regions.id, touchingRegionIds);
}
