import {
  observationFlagConflictSchema,
  observationFlagParamsSchema,
  observationFlagSchema,
  observationFlagUpdateSchema,
} from "@openbts/shared/contract";
import type { ObservationFlag, ObservationFlagUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { observationFlagScope, updateFlag } from "../../../../../features/observed/flags/update.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Dismiss or reopen a flag",
  description:
    "Send `status: dismissed` with a `dismissedReason`, and a `note` if you want, to set an open flag aside. " +
    "Sending it again for a dismissed flag changes the reason or the note. " +
    "The flag stays dismissed, and a new flag is raised only when its evidence changes in kind, as `GET /observed/flags` describes. " +
    "Send `status: open` to reopen a dismissed flag, which clears its reason and note. Its `suggestion` comes back with the next pass that raises it. " +
    "A resolved flag cannot be changed.",
  params: observationFlagParamsSchema,
  body: observationFlagUpdateSchema,
  response: {
    200: z.object({
      data: observationFlagSchema,
    }),
  },
};
const errorBodies = {
  409: z.object({
    errors: z.array(z.object({ code: z.literal("CONFLICT"), message: z.string(), details: z.array(observationFlagConflictSchema) })).min(1),
  }),
};
const errorReasons = {
  403: "Your editor access does not cover the flag. Also returned while observed data is switched off, unless you are an administrator.",
  404: "Flags of a kind you do not get in `GET /observed/flags` are not found either, such as those for maintainers when you are not one.",
  409:
    "The flag cannot be changed, and `details[0].kind` says why: `resolved` for a resolved flag, " +
    "and `openFlag` when you reopen it while another flag of the same kind is open for the same subject, the one in `observationFlagId`.",
};
type RequestData = { Params: z.infer<typeof observationFlagParamsSchema>; Body: ObservationFlagUpdate };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ObservationFlag>>) {
  return res.send({ data: await updateFlag(req, req.params.id, req.body) });
}

const updateObservationFlag: Route<RequestData, ObservationFlag> = {
  url: "/observed/flags/:id",
  method: "PATCH",
  config: { permissions: ["moderate:observations"], scope: observationFlagScope, errorBodies, errorReasons },
  schema: schemaRoute,
  handler,
};

export default updateObservationFlag;
