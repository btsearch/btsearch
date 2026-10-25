import {
  observedSiteParamsSchema,
  observedSiteStationConflictSchema,
  stationCreateSchema,
  stationQuerySchema,
  stationSchema,
} from "@openbts/shared/contract";
import type { Station, StationCreate, StationQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { createStationFromSite, stationFromSiteScope } from "../../../../../../features/observed/review/stationFromSite.js";
import { readStation } from "../../../../../../features/stations/read.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Create a station from an estimated site",
  description:
    "Takes the body of `POST /stations`, normally the suggestion of the site's `unmatchedSite` flag as you edited it, " +
    "and creates the station as that endpoint does. The station records that it was made from this site, the site's open flag closes, " +
    "and the site's cells are matched to it at once. Any member of a group creates one station for the whole mast. " +
    "To send cells you also need the `create:cells` permission. As an editor you need access to the region of the coordinates. " +
    "If you retry after a lost response, the 409 has the kind `madeFromSite` and names the station you created.",
  params: observedSiteParamsSchema,
  querystring: stationQuerySchema,
  body: stationCreateSchema,
  response: {
    201: z.object({
      data: stationSchema,
    }),
  },
};
const errorBodies = {
  409: z.object({
    errors: z
      .array(
        z.discriminatedUnion("code", [
          z.object({ code: z.literal("CONFLICT"), message: z.string(), details: z.array(observedSiteStationConflictSchema) }),
          z.object({ code: z.enum(["DUPLICATE_ENTRY", "DUPLICATE_REQUEST"]), message: z.string() }),
        ]),
      )
      .min(1),
  }),
};
const errorReasons = {
  400:
    "The station cannot be created as sent, as for `POST /stations`. Also returned when `location` is missing, " +
    "or the operator neither runs nor shares the site's network and none of its stations broadcasts it.",
  403:
    "A permission is missing, or your editor access does not cover the region of the coordinates. " +
    "Also returned while observed data is switched off, unless you are an administrator.",
  409:
    "The site has a station already. `details[0].kind` is `madeFromSite` when a station was made from the site, " +
    "and `matched` when the site is matched to one, with the station in `stationId`. " +
    "Also returned for a copy, a replaced site and a station's own site, with `details[0].kind` as `PATCH /observed/sites/{id}` gives it. " +
    "An active station that already has a cell with the same identity on one of the cell's networks answers `DUPLICATE_ENTRY`.",
};
type RequestData = { Params: z.infer<typeof observedSiteParamsSchema>; Querystring: StationQuery; Body: StationCreate };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Station>>) {
  const stationId = await createStationFromSite(req, req.params.id, req.body);
  return res.status(201).send({ data: await readStation(req, stationId, req.query.include) });
}

const createStationFromSiteRoute: Route<RequestData, Station> = {
  url: "/observed/sites/:id/station",
  method: "POST",
  config: {
    permissions: ["moderate:observations", "create:stations"],
    scope: stationFromSiteScope,
    errorBodies,
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default createStationFromSiteRoute;
