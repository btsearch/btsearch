import { submissionPhotoParamsSchema, submissionPhotoSchema, submissionPhotoUpdateSchema } from "@openbts/shared/contract";
import type { SubmissionPhoto, SubmissionPhotoUpdate } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../../errors.js";
import { actorIdFromRequest } from "../../../../../../features/access/access.js";
import { findSubmissionPhoto, listSubmissionPhotos } from "../../../../../../features/submissions/photoRead.js";
import { type SubmissionPhotoChanges, findPhotoEditableSubmission, updateSubmissionPhoto } from "../../../../../../features/submissions/photos.js";
import { loadUserRefViewer } from "../../../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../../../lib/runtimeSettings.js";

const schemaRoute = {
  summary: "Update a submission photo",
  description:
    "Updates the note or date of an uploaded photo, or makes it the main photo, and returns the photo. " +
    "This only works while the submission is pending. " +
    "You need to be the submitter, an administrator, or an editor whose grant covers everything the submission touches. " +
    "Setting `isMain` takes the main mark away from every other photo of the submission, uploaded or selected.",
  params: submissionPhotoParamsSchema,
  body: submissionPhotoUpdateSchema,
  response: {
    200: z.object({
      data: submissionPhotoSchema,
    }),
  },
};
const errorReasons = {
  400: "The request is invalid, `takenAt` is in the future, or the submission is no longer pending.",
  403: "You are not allowed to change this submission. Also returned when submissions are disabled.",
  404: "The submission does not exist, or it has no uploaded photo with this id.",
};
type RequestData = { Params: z.infer<typeof submissionPhotoParamsSchema>; Body: SubmissionPhotoUpdate };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<SubmissionPhoto>>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FEATURE_DISABLED");
  const { id, photoId } = req.params;
  const { note, takenAt, isMain } = req.body;
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  const takenOn = takenAt === undefined || takenAt === null ? takenAt : new Date(takenAt);
  if (takenOn && takenOn > new Date()) throw new ErrorResponse("BAD_REQUEST", { message: "takenAt cannot be in the future" });

  const submission = await findPhotoEditableSubmission(req, id, userId);
  const photo = await findSubmissionPhoto(id, photoId);
  if (!photo) throw new ErrorResponse("NOT_FOUND");

  const changes: SubmissionPhotoChanges = {};
  if (note !== undefined) changes.note = note || null;
  if (takenOn !== undefined) changes.taken_at = takenOn;
  if (isMain) changes.is_main = true;

  try {
    await updateSubmissionPhoto(req, submission, photo, changes);
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("FAILED_TO_UPDATE", { cause: error });
  }

  const [updated] = await listSubmissionPhotos(id, await loadUserRefViewer(req), [photo.id]);
  if (!updated) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: updated });
}

const patchSubmissionPhoto: Route<RequestData, SubmissionPhoto> = {
  url: "/submissions/:id/photos/:photoId",
  method: "PATCH",
  config: { permissions: ["update:submissions"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default patchSubmissionPhoto;
