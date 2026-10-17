import { type PackCapabilityName, countryCodesWith } from "@openbts/country-packs";
import { countries, locations, regions } from "@openbts/drizzle";
import { type SQL, type SQLWrapper, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import redis from "../../database/redis.js";
import { ErrorResponse } from "../../errors.js";
import { forgetRedisCache, withRedisStaleCache } from "../../lib/redisCache.js";
import { canSeeCountry } from "../access/access.js";
import { sessionOrTokenAccessFromRequest } from "../access/staff.js";

type CountryVisibility = { code: string; isVisible: boolean };

const COUNTRY_VISIBILITY_CACHE_KEY = "countries:v2:visibility";
const COUNTRY_VISIBILITY_CACHE = { freshTtlSeconds: 60, staleTtlSeconds: 120 };

export function locationInPublicCountry(locationId: SQLWrapper): SQL {
  return sql`NOT EXISTS (
    SELECT 1 FROM ${locations} AS hidden_location
    INNER JOIN ${regions} AS hidden_region ON hidden_region.id = hidden_location.region_id
    INNER JOIN ${countries} AS hidden_country ON hidden_country.code = hidden_region.country_code
    WHERE hidden_location.id = ${locationId} AND NOT hidden_country.is_visible
  )`;
}

async function loadStoredCountryVisibility(): Promise<CountryVisibility[]> {
  return db.select({ code: countries.code, isVisible: countries.isVisible }).from(countries);
}

export async function loadCountryVisibility(): Promise<CountryVisibility[]> {
  if (!redis.isReady) return loadStoredCountryVisibility();

  const { value } = await withRedisStaleCache(COUNTRY_VISIBILITY_CACHE_KEY, COUNTRY_VISIBILITY_CACHE, loadStoredCountryVisibility);
  return value;
}

export function forgetCountryVisibility(): Promise<void> {
  return forgetRedisCache(COUNTRY_VISIBILITY_CACHE_KEY);
}

export async function loadHiddenCountryCodes(req: FastifyRequest): Promise<string[]> {
  const hidden = (await loadCountryVisibility()).filter((country) => !country.isVisible);
  if (hidden.length === 0) return [];

  const access = await sessionOrTokenAccessFromRequest(req);
  return hidden.filter((country) => !canSeeCountry(access, country.code)).map((country) => country.code);
}

export async function assertCountryVisible(req: FastifyRequest, countryCode: string): Promise<void> {
  const [visible] = await loadVisibleCountryCodes(req, [countryCode]);
  if (!visible) throw new ErrorResponse("NOT_FOUND");
}

export async function assertCapabilityVisible(req: FastifyRequest, capability: PackCapabilityName): Promise<void> {
  const hiddenCountryCodes = await loadHiddenCountryCodes(req);
  if (countryCodesWith(capability).every((countryCode) => hiddenCountryCodes.includes(countryCode))) throw new ErrorResponse("NOT_FOUND");
}

export async function loadVisibleCountryCodes(req: FastifyRequest, codes?: readonly string[]): Promise<string[]> {
  if (codes?.length === 0) return [];

  const rows = (await loadCountryVisibility()).filter((country) => codes?.includes(country.code) ?? true);
  const access = rows.every((row) => row.isVisible) ? null : await sessionOrTokenAccessFromRequest(req);
  return rows.filter((row) => row.isVisible || canSeeCountry(access, row.code)).map((row) => row.code);
}
