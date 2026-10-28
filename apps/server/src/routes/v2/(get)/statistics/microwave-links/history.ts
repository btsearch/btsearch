import { microwaveLinkHistoryQuerySchema, microwaveLinkHistorySchema } from "@openbts/shared/contract";
import type { MicrowaveLinkHistory, MicrowaveLinkHistoryQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadVisibleCountryCodes } from "../../../../../features/countries/visibility.js";
import { loadOfficialVisibility } from "../../../../../features/official/visibility.js";
import { filterMicrowaveLinkHistories, loadMicrowaveLinkHistories } from "../../../../../features/stats/microwaveLinks/read.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get monthly microwave link totals per source",
  description:
    "Each point is the number of links one licensee held in one monthly snapshot, from the same snapshots as `GET /statistics/microwave-links`.\n\n" +
    "Sources you cannot see and sources without a snapshot are left out. The numbers are cached for 10 minutes.",
  querystring: microwaveLinkHistoryQuerySchema,
  response: {
    200: z.object({
      data: z.array(microwaveLinkHistorySchema),
    }),
  },
};
type ReqQuery = { Querystring: MicrowaveLinkHistoryQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<MicrowaveLinkHistory[]>>) {
  const [countryCodes, visibility, histories] = await Promise.all([
    loadVisibleCountryCodes(req, req.query.countryCodes),
    loadOfficialVisibility(req),
    loadMicrowaveLinkHistories(),
  ]);

  return res.send({ data: filterMicrowaveLinkHistories(histories, countryCodes, visibility, req.query) });
}

const getMicrowaveLinkHistory: Route<ReqQuery, MicrowaveLinkHistory[]> = {
  url: "/statistics/microwave-links/history",
  method: "GET",
  config: { permissions: ["read:stats"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getMicrowaveLinkHistory;
