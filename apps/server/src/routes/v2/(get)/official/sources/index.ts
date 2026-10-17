import { officialSources } from "@openbts/drizzle";
import { officialSourceListQuerySchema, officialSourceSchema } from "@openbts/shared/contract";
import type { OfficialSource, OfficialSourceListQuery } from "@openbts/shared/contract";
import { asc, inArray } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../database/psql.js";
import { loadOfficialSources, toPublicOfficialSource } from "../../../../../features/official/sources.js";
import { loadOfficialVisibility } from "../../../../../features/official/visibility.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List official sources",
  description:
    "Returns the official sources in one response, ordered by key. " +
    "A source is one register an authority publishes, together with the terms it is published under. " +
    "Its `datasets` are the parts that are downloaded and imported on their own.\n\n" +
    "Show `attribution`, and `coverageNote` when it is set, wherever you show a source's data. " +
    "`importedAt` on each dataset tells you how recent that data is.\n\n" +
    "You get the visible sources of the countries you can access. " +
    "Administrators get every source, hidden or not, along with the fields marked as only returned to administrators.",
  querystring: officialSourceListQuerySchema,
  response: {
    200: z.object({
      data: z.array(officialSourceSchema),
    }),
  },
};
type ReqQuery = { Querystring: OfficialSourceListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<OfficialSource[]>>) {
  const { countryCodes } = req.query;
  const [{ sourceIds }, rows] = await Promise.all([
    loadOfficialVisibility(req),
    db
      .select()
      .from(officialSources)
      .where(countryCodes ? inArray(officialSources.countryCode, countryCodes) : undefined)
      .orderBy(asc(officialSources.key)),
  ]);
  const sources = await loadOfficialSources(sourceIds === null ? rows : rows.filter((row) => sourceIds.includes(row.id)));

  return res.send({ data: sourceIds === null ? sources : sources.map(toPublicOfficialSource) });
}

const getOfficialSources: Route<ReqQuery, OfficialSource[]> = {
  url: "/official/sources",
  method: "GET",
  config: { allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getOfficialSources;
