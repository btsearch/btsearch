import { microwaveLinkListQuerySchema, microwaveLinkListSchema } from "@openbts/shared/contract";
import type { MicrowaveLinkList, MicrowaveLinkListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { fetchMicrowaveLinkPage } from "../../../../../features/official/microwaveLinks.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List microwave links",
  querystring: microwaveLinkListQuerySchema,
  response: {
    200: microwaveLinkListSchema,
  },
};
const errorReasons = {
  400: "The `cursor` is invalid.",
  403: "Lists are disabled and you sent `listId`.",
  404: "The list in `listId` does not exist, or it is a private list you cannot access.",
};
type ReqQuery = { Querystring: MicrowaveLinkListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<MicrowaveLinkList>>) {
  return res.send(await fetchMicrowaveLinkPage(req, req.query));
}

const getMicrowaveLinks: Route<ReqQuery, MicrowaveLinkList> = {
  url: "/official/microwave-links",
  method: "GET",
  config: { permissions: ["read:microwave_links"], allowGuestAccess: true, errorReasons },
  schema: schemaRoute,
  handler,
};

export default getMicrowaveLinks;
