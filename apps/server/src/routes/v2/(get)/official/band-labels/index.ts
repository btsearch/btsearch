import { officialBandLabelQuerySchema, officialBandLabelSchema } from "@openbts/shared/contract";
import type { OfficialBandLabel, OfficialBandLabelQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadOfficialBandLabels } from "../../../../../features/official/bandLabels.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List band labels",
  description:
    "Returns the band labels that official permits are issued for, once for each country and source. " +
    "A label is listed only while at least one permit you can see uses it. " +
    "Use the list to offer the values of `rats` and `bandLabels` in the other official endpoints.\n\n" +
    "The labels are ordered by technology, newest first (NR, LTE, UMTS, CDMA, GSM, then the others), " +
    "then with commercial bands before railway bands, then by frequency.",
  querystring: officialBandLabelQuerySchema,
  response: {
    200: z.object({
      data: z.array(officialBandLabelSchema),
    }),
  },
};
type ReqQuery = { Querystring: OfficialBandLabelQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<OfficialBandLabel[]>>) {
  return res.send({ data: await loadOfficialBandLabels(req, req.query) });
}

const getOfficialBandLabels: Route<ReqQuery, OfficialBandLabel[]> = {
  url: "/official/band-labels",
  method: "GET",
  config: { permissions: ["read:official_permits"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getOfficialBandLabels;
