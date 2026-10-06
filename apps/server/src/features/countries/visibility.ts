import { countries, locations, regions } from "@openbts/drizzle";
import { type SQL, type SQLWrapper, eq, inArray, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { canSeeCountry } from "../access/access.js";
import { sessionOrTokenAccessFromRequest } from "../access/staff.js";

export function locationInPublicCountry(locationId: SQLWrapper): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${locations} AS hidden_location
    INNER JOIN ${regions} AS hidden_region ON hidden_region.id = hidden_location.region_id
    INNER JOIN ${countries} AS hidden_country ON hidden_country.code = hidden_region.country_code
    WHERE hidden_location.id = ${locationId} AND NOT hidden_country.is_visible
  )`;
}

export async function loadHiddenCountryCodes(req: FastifyRequest): Promise<string[]> {
  const rows = await db.select({ code: countries.code }).from(countries).where(eq(countries.isVisible, false));
  if (rows.length === 0) return [];

  const access = await sessionOrTokenAccessFromRequest(req);
  return rows.filter((row) => !canSeeCountry(access, row.code)).map((row) => row.code);
}

export async function assertCountryVisible(req: FastifyRequest, countryCode: string): Promise<void> {
  const [visible] = await loadVisibleCountryCodes(req, [countryCode]);
  if (!visible) throw new ErrorResponse("NOT_FOUND");
}

export async function loadVisibleCountryCodes(req: FastifyRequest, codes?: readonly string[]): Promise<string[]> {
  if (codes?.length === 0) return [];

  const rows = await db
    .select({ code: countries.code, isVisible: countries.isVisible })
    .from(countries)
    .where(codes ? inArray(countries.code, [...codes]) : undefined);
  const access = rows.every((row) => row.isVisible) ? null : await sessionOrTokenAccessFromRequest(req);
  return rows.filter((row) => row.isVisible || canSeeCountry(access, row.code)).map((row) => row.code);
}
