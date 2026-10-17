import { microwaveLinkParamsSchema, microwaveLinkQuerySchema, microwaveLinkSchema } from "@openbts/shared/contract";
import type { MicrowaveLink, MicrowaveLinkQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { readMicrowaveLink } from "../../../../../features/official/microwaveLinks.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Get a microwave link",
  description:
    "Returns one microwave link from an official source. " +
    "To get the other links of the same permit, call `GET /official/microwave-links` with its `permitNumbers` and `licenseeIds`.",
  params: microwaveLinkParamsSchema,
  querystring: microwaveLinkQuerySchema,
  response: {
    200: z.object({
      data: microwaveLinkSchema,
    }),
  },
};
type RequestData = { Params: z.infer<typeof microwaveLinkParamsSchema>; Querystring: MicrowaveLinkQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<MicrowaveLink>>) {
  return res.send({ data: await readMicrowaveLink(req, req.params.id, req.query.include ?? []) });
}

const getMicrowaveLink: Route<RequestData, MicrowaveLink> = {
  url: "/official/microwave-links/:id",
  method: "GET",
  config: {
    permissions: ["read:microwave_links"],
    allowGuestAccess: true,
    errorReasons: { 404: "The microwave link does not exist, or its source is hidden from you." },
  },
  schema: schemaRoute,
  handler,
};

export default getMicrowaveLink;
