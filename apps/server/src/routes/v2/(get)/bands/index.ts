import { bands, countryBands } from "@openbts/drizzle";
import { bandListQuerySchema, bandSchema } from "@openbts/shared/contract";
import type { Band, BandListQuery } from "@openbts/shared/contract";
import { and, inArray, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../database/psql.js";
import { DATABASE_RATS, toBand } from "../../../../features/bands/serialize.js";
import { loadVisibleCountryCodes } from "../../../../features/countries/visibility.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List bands",
  description:
    "Returns all bands in one response, sorted by technology and then by `labelMhz`. " +
    "Use `countryCodes` to get only the bands in the band plan of those countries. " +
    "Countries that do not exist or that you cannot access match no bands. " +
    "`number`, `downlinkKhz` and `uplinkKhz` come from the 3GPP catalogue, so a band without a `code` has none of them.",
  querystring: bandListQuerySchema,
  response: {
    200: z.object({
      data: z.array(bandSchema),
    }),
  },
};
type ReqQuery = { Querystring: BandListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<Band[]>>) {
  const { countryCodes, rats } = req.query;

  const conditions = [sql`${bands.value} IS DISTINCT FROM 0`];
  if (rats) {
    const databaseRats = rats.map((rat) => DATABASE_RATS[rat]);
    conditions.push(inArray(bands.rat, databaseRats));
  }
  if (countryCodes) {
    const plannedIn = await loadVisibleCountryCodes(req, countryCodes);
    if (plannedIn.length === 0) return res.send({ data: [] });

    const plannedBandIds = db.select({ bandId: countryBands.bandId }).from(countryBands).where(inArray(countryBands.countryCode, plannedIn));
    conditions.push(inArray(bands.id, plannedBandIds));
  }

  const rows = await db
    .select()
    .from(bands)
    .where(and(...conditions))
    .orderBy(bands.rat, bands.value, bands.id);

  return res.send({ data: rows.map(toBand) });
}

const getBands: Route<ReqQuery, Band[]> = {
  url: "/bands",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getBands;
