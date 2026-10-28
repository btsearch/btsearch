import { photoBreakdownQuerySchema, photoBreakdownRowSchema } from "@openbts/shared/contract";
import type { PhotoBreakdownQuery, PhotoBreakdownRow } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadVisibleCountryCodes } from "../../../../features/countries/visibility.js";
import { loadPhotoBreakdown } from "../../../../features/stats/read.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a breakdown of photos per country",
  description:
    "Counts the unique photos attached to active stations. " +
    "Rows come in no particular order, and countries without photos are left out. The numbers are cached for 10 minutes.",
  querystring: photoBreakdownQuerySchema,
  response: {
    200: z.object({
      data: z.array(photoBreakdownRowSchema),
    }),
  },
};
type ReqQuery = { Querystring: PhotoBreakdownQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<PhotoBreakdownRow[]>>) {
  const countryCodes = new Set(await loadVisibleCountryCodes(req, req.query.countryCodes));
  if (countryCodes.size === 0) return res.send({ data: [] });

  const rows = await loadPhotoBreakdown(req.query.groupBy ?? []);

  return res.send({ data: rows.filter((row) => countryCodes.has(row.countryCode)) });
}

const getPhotoStatistics: Route<ReqQuery, PhotoBreakdownRow[]> = {
  url: "/statistics/photos",
  method: "GET",
  config: { permissions: ["read:stats"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getPhotoStatistics;
