import { measurementTermsAcceptSchema, measurementTermsSchema } from "@openbts/shared/contract";
import type { MeasurementTerms, MeasurementTermsAccept } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { acceptTerms } from "../../../../features/measurements/contributors/terms.js";
import { assertMeasurementUploadsEnabled } from "../../../../features/measurements/settings.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";

const schemaRoute = {
  summary: "Accept the contributor terms",
  description: "Registering a device and uploading need the current version. Accepting it twice changes nothing.",
  body: measurementTermsAcceptSchema,
  response: {
    200: z.object({
      data: measurementTermsSchema,
    }),
  },
};
const errorReasons = {
  403: "Also returned while uploads are switched off.",
  409: "`version` is not the current version of the terms.",
};
type ReqBody = { Body: MeasurementTermsAccept };

async function handler(req: FastifyRequest<ReqBody>, res: ReplyPayload<JSONBody<MeasurementTerms>>) {
  assertMeasurementUploadsEnabled();
  const userId = req.userSession?.user.id;
  if (userId === undefined) throw new ErrorResponse("UNAUTHORIZED");

  return res.send({ data: await acceptTerms(userId, req.body.version) });
}

const acceptMeasurementTerms: Route<ReqBody, MeasurementTerms> = {
  url: "/measurements/terms",
  method: "PUT",
  config: { permissions: ["upload:observations"], callers: ["app", "session"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default acceptMeasurementTerms;
