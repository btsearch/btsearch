import { measurementTermsAcceptSchema, noContentSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { assertMeasurementUploadsEnabled } from "../../../../features/measurements/settings.js";
import { acceptTerms } from "../../../../features/measurements/terms.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Accept the contributor terms",
  description: "Registering a device and uploading need the current version. Accepting it twice changes nothing.",
  body: measurementTermsAcceptSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  403: "Also returned while uploads are switched off.",
  409: "`version` is not the current version of the terms.",
};
type ReqBody = { Body: z.infer<typeof measurementTermsAcceptSchema> };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<EmptyResponse>) {
  assertMeasurementUploadsEnabled();
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  await acceptTerms(userId, req.body.version);
  return res.status(204).send();
}

const acceptMeasurementTerms: Route<ReqBody, void> = {
  url: "/measurements/terms",
  method: "PUT",
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default acceptMeasurementTerms;
