import { microwaveLinkListQuerySchema, microwaveLinkListSchema } from "@openbts/shared/contract";
import type { MicrowaveLinkList, MicrowaveLinkListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { fetchMicrowaveLinkPage } from "../../../../../features/official/microwaveLinks.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List microwave links",
  description:
    "Returns microwave links from the official sources, one page at a time. " +
    "A link goes from its transmitting end `tx` to its receiving end `rx`, and several links can share one permit number.\n\n" +
    "`q` finds links by permit number and also returns numbers that only closely resemble the text. " +
    "Use `permitNumbers` when you need exact matches, for example to gather every link of a permit you already have. " +
    "`bbox` matches a link when either end is inside the box.\n\n" +
    "Links of hidden sources, and of sources in countries you cannot access, are left out. Administrators also get them.",
  querystring: microwaveLinkListQuerySchema,
  response: {
    200: microwaveLinkListSchema,
  },
};
const errorReasons = {
  400: "A query parameter did not pass validation, or the `cursor` is invalid. A cursor only works with the `sort` it was returned for.",
  403:
    "Lists are disabled and you sent `listId`. " +
    "Also returned when your API key or token cannot be used for this endpoint, two-factor authentication still has to be set up, " +
    "or the endpoint is disabled.",
  404: "Only returned when you send `listId`. The list does not exist, or it is a private list you cannot access.",
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
