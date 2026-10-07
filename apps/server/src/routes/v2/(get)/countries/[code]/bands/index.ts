import { bands, countryBands } from "@openbts/drizzle";
import { countryBandListQuerySchema, countryBandSchema, countryParamsSchema } from "@openbts/shared/contract";
import type { CountryBand, CountryBandListQuery } from "@openbts/shared/contract";
import { and, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import db from "../../../../../../database/psql.js";
import { toCountryBand } from "../../../../../../features/bands/serialize.js";
import { assertCountryVisible } from "../../../../../../features/countries/visibility.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List the bands in a country's band plan",
  description:
    "Returns the country's band plan, which lists the bands that cells in that country can use. " +
    "Cells are checked against the plan whenever they are created or changed, directly or through a submission. " +
    "Add `include=band` to get the full band object in each entry.",
  params: countryParamsSchema,
  querystring: countryBandListQuerySchema,
  response: {
    200: z.object({
      data: z.array(countryBandSchema),
    }),
  },
};
type ReqParams = { Params: z.infer<typeof countryParamsSchema> };
type ReqQuery = { Querystring: CountryBandListQuery };
type RequestData = ReqParams & ReqQuery;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<CountryBand[]>>) {
  const { code } = req.params;
  const includeBand = req.query.include?.includes("band") === true;

  await assertCountryVisible(req, code);

  const rows = await db
    .select({ plan: countryBands, band: bands })
    .from(countryBands)
    .innerJoin(bands, eq(bands.id, countryBands.bandId))
    .where(and(eq(countryBands.countryCode, code), sql`${bands.value} IS DISTINCT FROM 0`))
    .orderBy(bands.rat, bands.value, bands.id);

  return res.send({ data: rows.map(({ plan, band }) => toCountryBand(plan, includeBand ? band : undefined)) });
}

const getCountryBands: Route<RequestData, CountryBand[]> = {
  url: "/countries/:code/bands",
  method: "GET",
  config: {
    allowGuestAccess: true,
    errorReasons: { 404: "The country does not exist, or it is hidden and you cannot access it." },
  },
  schema: schemaRoute,
  handler,
};

export default getCountryBands;
