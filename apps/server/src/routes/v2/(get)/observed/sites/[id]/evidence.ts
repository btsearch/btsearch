import { observedSiteEvidenceSchema, observedSiteParamsSchema } from "@openbts/shared/contract";
import type { ObservedSiteEvidence } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { readSiteEvidence } from "../../../../../../features/observed/review/evidence.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

type RequestData = { Params: z.infer<typeof observedSiteParamsSchema> };

const schemaRoute = {
  summary: "Get what an estimated site rests on",
  description:
    "Answers where the site may stand, as a grid of how well each place fits the measurements. " +
    "Also the distance the timing advance gives in each square, after calibration, the cells those squares belong to, " +
    "and every known place the estimate was tested against, with its probability and what stands there. " +
    "Editors get the sites inside their grants, administrators every site.",
  params: observedSiteParamsSchema,
  response: {
    200: z.object({
      data: observedSiteEvidenceSchema,
    }),
  },
};
const errorReasons = {
  403: "Observed data is switched off and you are not an administrator.",
  404: "No site has this id, or it lies outside your grants.",
};

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ObservedSiteEvidence>>) {
  res.header("Cache-Control", "private, no-store");
  return res.send({ data: await readSiteEvidence(req, req.params.id) });
}

const getObservedSiteEvidence: Route<RequestData, ObservedSiteEvidence> = {
  url: "/observed/sites/:id/evidence",
  method: "GET",
  config: { permissions: ["read:observations"], permissionsCheckedByHandler: ["moderate:observations"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getObservedSiteEvidence;
