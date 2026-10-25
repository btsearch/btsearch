import { observationFlagListQuerySchema, observationFlagListSchema } from "@openbts/shared/contract";
import type { ObservationFlagList, ObservationFlagListQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { listFlags } from "../../../../../features/observed/flags/read.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "List flags",
  description:
    "A flag is something phones measured that disagrees with the database. " +
    "The server raises flags by itself and resolves each one once the database and the phones agree. " +
    "An open flag is updated in place as its evidence changes. " +
    "A dismissed flag stays dismissed. A new flag with a new id is raised only when its evidence changes in kind: " +
    "another value, more people than when it was dismissed, or a site that moved beyond its radius. " +
    "When a group of sites gets another lead, its flags keep their ids and take the new lead's `observedSiteId`. " +
    "To follow the queue, sort by `updatedAt`, pass `statuses=open,resolved,dismissed` to also get the flags that closed, " +
    "and ask again with `updatedAfter`. " +
    "Where a flag has a `suggestion`, it is the change that fixes it, sent to the endpoint of its kind:\n\n" +
    "- `POST /cells/apply` for `cellMissing`, `valueDiffers`, `valueMissing`, `networkMissing`, `networkNotSeen`, `suggestedSite` and `renumbered`. " +
    "The suggestion holds the items for `cells`, so you send `[{ stationId, cells: suggestion.cells, observationFlagIds: [id] }]` " +
    "with the flag's `stationId` and `id`. " +
    "A request changes each cell once, so when several flags of a station change one cell, merge their items with the same `id` into one\n" +
    "- `POST /observed/sites/{id}/station` for `unmatchedSite`\n" +
    "- `PATCH /stations/{id}` for `siteIdKnown`\n" +
    "- `PUT /countries/{code}/bands/{bandId}` for `bandNotInPlan`\n" +
    "- `POST /measurements/reading-blocks` for `readerQuirk`\n\n" +
    "`untrustedContributor` and `deviceRevoked` have no suggestion. You act on them with `PATCH /measurements/contributors/{userId}` " +
    "and `PATCH /measurements/devices/{id}`. " +
    "Editors get the flags of stations their grant covers and of sites shown inside it, and maintainers also get `bandNotInPlan` in their countries. " +
    "`readerQuirk`, `deviceRevoked`, `untrustedContributor`, `nodeSpansPlaces` and `gnbLengthSuggestion` are for administrators only.",
  querystring: observationFlagListQuerySchema,
  response: {
    200: observationFlagListSchema,
  },
};
const errorReasons = {
  400: "The `cursor` is invalid.",
  403: "Observed data is switched off and you are not an administrator.",
};
type ReqQuery = { Querystring: ObservationFlagListQuery };

async function handler(req: FastifyRequest<ReqQuery>, res: ReplyPayload<JSONBody<ObservationFlagList>>) {
  res.header("Cache-Control", "private, no-store");
  return res.send(await listFlags(req, req.query));
}

const getObservationFlags: Route<ReqQuery, ObservationFlagList> = {
  url: "/observed/flags",
  method: "GET",
  config: { permissionsCheckedByHandler: ["moderate:observations"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getObservationFlags;
