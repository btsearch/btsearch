import { measurementExclusionResultSchema, measurementExclusionSchema } from "@openbts/shared/contract";
import type { MeasurementExclusion, MeasurementExclusionResult } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";

import { excludeUploads } from "../../../../../features/measurements/exclusions.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";

type ReqBody = { Body: MeasurementExclusion };

const schemaRoute = {
  summary: "Exclude several uploads",
  description:
    "Withdrawn and excluded uploads are left as they are, so an excluded upload keeps its first `reason`. " +
    "Excluded files are kept until they expire, as evidence. Works while uploads are switched off.",
  body: measurementExclusionSchema,
  response: { 200: measurementExclusionResultSchema },
};
const errorReasons = { 404: "An id in `uploadIds` is not an upload, or no account has the `userId`. Nothing is excluded then." };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<MeasurementExclusionResult>>) {
  return res.send({ data: { excludedCount: await excludeUploads(req, req.body) } });
}

const excludeMeasurementUploads: Route<ReqBody, MeasurementExclusionResult> = {
  url: "/measurements/uploads/exclusions",
  method: "POST",
  config: { permissions: ["manage:observations"], callers: ["session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default excludeMeasurementUploads;
