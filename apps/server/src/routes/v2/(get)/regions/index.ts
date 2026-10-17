import { regions } from "@openbts/drizzle";
import { regionListQuerySchema, regionSchema } from "@openbts/shared/contract";
import type { Region, RegionListQuery } from "@openbts/shared/contract";
import { and, eq, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { loadVisibleCountryCodes } from "../../../../features/countries/visibility.js";
import { findRegionIdAt, outlineTouches } from "../../../../features/regions/lookup.js";
import { toRegion } from "../../../../features/regions/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List regions",
  description: "Regions are ordered by country and then by name. With `bbox` you can find out which countries a map is showing.",
  querystring: regionListQuerySchema,
  response: {
    200: z.object({
      data: z.array(regionSchema),
    }),
  },
};
type ReqQuery = { Querystring: RegionListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<Region[]>>) {
  const { latitude, longitude, bbox } = req.query;
  const point = latitude === undefined || longitude === undefined ? null : { latitude, longitude };

  const [countryCodes, regionIdAtPoint] = await Promise.all([
    loadVisibleCountryCodes(req, req.query.countryCodes),
    point === null ? null : findRegionIdAt(point),
  ]);
  if (countryCodes.length === 0 || (point !== null && regionIdAtPoint === null)) return res.send({ data: [] });

  const rows = await db
    .select()
    .from(regions)
    .where(
      and(
        inArray(regions.countryCode, countryCodes),
        regionIdAtPoint === null ? undefined : eq(regions.id, regionIdAtPoint),
        bbox === undefined ? undefined : outlineTouches(bbox),
      ),
    )
    .orderBy(regions.countryCode, regions.name);

  return res.send({ data: rows.map(toRegion) });
}

const getRegions: Route<ReqQuery, Region[]> = {
  url: "/regions",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getRegions;
