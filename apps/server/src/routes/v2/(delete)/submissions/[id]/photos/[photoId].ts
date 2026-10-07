import { noContentSchema, submissionPhotoParamsSchema } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import type { z } from "zod/v4";

import { ErrorResponse } from "../../../../../../errors.js";
import { actorIdFromRequest } from "../../../../../../features/access/access.js";
import { findSubmissionPhoto } from "../../../../../../features/submissions/photoRead.js";
import { findPhotoEditableSubmission, removeSubmissionPhoto } from "../../../../../../features/submissions/photos.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { EmptyResponse, Route } from "../../../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../../../lib/runtimeSettings.js";

const schemaRoute = {
  summary: "Delete a submission photo",
  description:
    "Deletes a photo that was uploaded to a submission. This only works while the submission is pending. " +
    "You need to be the submitter, an administrator, or an editor whose grant covers everything the submission touches.",
  params: submissionPhotoParamsSchema,
  response: { 204: noContentSchema },
};
const errorReasons = {
  400: "The id is invalid, or the submission is no longer pending.",
  403: "You are not allowed to change this submission. Also returned when submissions are disabled.",
  404: "The submission does not exist, or it has no uploaded photo with this id.",
};
type ReqParams = { Params: z.infer<typeof submissionPhotoParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<EmptyResponse>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FEATURE_DISABLED");
  const { id, photoId } = req.params;
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  const submission = await findPhotoEditableSubmission(req, id, userId);
  const photo = await findSubmissionPhoto(id, photoId);
  if (!photo) throw new ErrorResponse("NOT_FOUND");

  try {
    await removeSubmissionPhoto(req, submission, photo);
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_DELETE", { cause: error });
  }

  return res.status(204).send();
}

const deleteSubmissionPhoto: Route<ReqParams, void> = {
  url: "/submissions/:id/photos/:photoId",
  method: "DELETE",
  config: { permissions: ["delete:submissions"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default deleteSubmissionPhoto;
