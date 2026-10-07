import { submissionParamsSchema, submissionPhotoSchema, submissionPhotoUploadSchema } from "@openbts/shared/contract";
import type { SubmissionPhoto } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { actorIdFromRequest } from "../../../../../features/access/access.js";
import { listSubmissionPhotos } from "../../../../../features/submissions/photoRead.js";
import { uploadSubmissionPhotos } from "../../../../../features/submissions/photos.js";
import { loadUserRefViewer } from "../../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../../lib/runtimeSettings.js";

const schemaRoute = {
  summary: "Upload photos to a submission",
  description:
    "Uploads photos to a pending submission and returns the ones that were added. Only the submitter can upload. " +
    "A submission holds up to 10 uploaded photos, and files beyond that are ignored. " +
    "If one file is invalid, none of the files in the request is saved. " +
    "Photos are re-encoded on the server, which removes their metadata, including the GPS position.",
  params: submissionParamsSchema,
  response: {
    201: z.object({
      data: z.array(submissionPhotoSchema),
    }),
  },
};
const errorReasons = {
  400:
    "The request is not multipart or contains no file, the submission is no longer pending or already has 10 photos, " +
    "or a file was not accepted. Files must be readable images of at most 20 MB, at least 640 by 480 pixels (`PHOTO_TOO_SMALL`) " +
    "and not too blurry (`PHOTO_TOO_BLURRY`).",
  403: "Submissions or photo uploads are disabled, or you are not the submitter.",
  404: "The submission does not exist.",
};
type ReqParams = { Params: z.infer<typeof submissionParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<SubmissionPhoto[]>>) {
  const settings = getRuntimeSettings();
  if (!settings.submissionsEnabled || !settings.photosEnabled) throw new ErrorResponse("FEATURE_DISABLED");
  const { id } = req.params;
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  if (!(req.headers["content-type"] ?? "").includes("multipart/form-data")) {
    throw new ErrorResponse("BAD_REQUEST", { message: "Photos must be sent as multipart/form-data" });
  }

  const uploaded = await uploadSubmissionPhotos(req, id, userId);
  const photos = await listSubmissionPhotos(
    id,
    await loadUserRefViewer(req),
    uploaded.map((photo) => photo.id),
  );

  return res.status(201).send({ data: photos });
}

const uploadPhotos: Route<ReqParams, SubmissionPhoto[]> = {
  url: "/submissions/:id/photos",
  method: "POST",
  config: { permissions: ["create:submissions"], multipartBody: submissionPhotoUploadSchema, errorReasons },
  schema: schemaRoute,
  handler,
};

export default uploadPhotos;
