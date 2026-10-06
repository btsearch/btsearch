import { noContentSchema, submissionParamsSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { removeSubmission } from "../../../../features/submissions/remove.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../lib/runtimeSettings.js";

const schemaRoute = {
  summary: "Delete a submission",
  description:
    "Deletes a submission along with its proposed changes and its uploaded photos. " +
    "You can delete your own submission while it is pending, and administrators can delete any submission at any time. " +
    "Deleting a submission that was already accepted does not revert its changes, and photos it published stay.",
  params: submissionParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  400: "The id is invalid, or the submission has already been reviewed and you are not an administrator.",
  403: "Submissions are disabled, or the submission is not yours and you are not an administrator.",
  404: "The submission does not exist.",
  409: "The submission was reviewed while your request was being processed.",
};
type ReqParams = { Params: z.infer<typeof submissionParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FEATURE_DISABLED");
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  await removeSubmission(req, req.params.id, userId);

  return res.status(204).send();
}

const deleteSubmission: Route<ReqParams, void> = {
  url: "/submissions/:id",
  method: "DELETE",
  config: { permissions: ["delete:submissions"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default deleteSubmission;
