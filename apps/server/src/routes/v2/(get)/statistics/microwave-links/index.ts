import { microwaveLinkBreakdownQuerySchema, microwaveLinkBreakdownSchema } from "@openbts/shared/contract";
import type { MicrowaveLinkBreakdown, MicrowaveLinkBreakdownQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { loadVisibleCountryCodes } from "../../../../../features/countries/visibility.js";
import { loadOfficialVisibility } from "../../../../../features/official/visibility.js";
import { filterMicrowaveLinkBreakdowns, loadMicrowaveLinkBreakdowns } from "../../../../../features/stats/microwaveLinks/read.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a breakdown of microwave links per source",
  description:
    "A link is one hop between two ends. The directions and channels a licensee holds under one permit make one link. " +
    "Without a permit number, those between the same two ends do.\n\n" +
    "A snapshot is taken after each import that applies new microwave links, and the last one of a month replaces the earlier ones. " +
    "Sources you cannot see and sources without a snapshot are left out. The numbers are cached for 10 minutes.",
  querystring: microwaveLinkBreakdownQuerySchema,
  response: {
    200: z.object({
      data: z.array(microwaveLinkBreakdownSchema),
    }),
  },
};
type ReqQuery = { Querystring: MicrowaveLinkBreakdownQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<MicrowaveLinkBreakdown[]>>) {
  const [countryCodes, visibility, breakdowns] = await Promise.all([
    loadVisibleCountryCodes(req, req.query.countryCodes),
    loadOfficialVisibility(req),
    loadMicrowaveLinkBreakdowns(req.query.startsOn),
  ]);

  return res.send({ data: filterMicrowaveLinkBreakdowns(breakdowns, countryCodes, visibility) });
}

const getMicrowaveLinkStatistics: Route<ReqQuery, MicrowaveLinkBreakdown[]> = {
  url: "/statistics/microwave-links",
  method: "GET",
  config: { permissions: ["read:stats"], allowGuestAccess: true },
  schema: schemaRoute,
  handler,
};

export default getMicrowaveLinkStatistics;
