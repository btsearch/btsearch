import { submissionParamsSchema, submissionPhotoSchema } from "@openbts/shared/contract";
import type { SubmissionPhoto } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { actorIdFromRequest } from "../../../../../features/access/access.js";
import { listSubmissionPhotos } from "../../../../../features/submissions/photoRead.js";
import { findReadableSubmission } from "../../../../../features/submissions/read.js";
import { loadUserRefViewer } from "../../../../../features/users/userRef.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../../lib/runtimeSettings.js";

const schemaRoute = {
  summary: "List a submission's photos",
  description:
    "Returns the photos uploaded to the submission, oldest first. " +
    "Existing photos that the submission selects or removes are not included; you find those in its `changes.photos`. " +
    "Anyone who can read the submission can read its photos.",
  params: submissionParamsSchema,
  response: {
    200: z.object({
      data: z.array(submissionPhotoSchema),
    }),
  },
};
const errorReasons = {
  403: "Submissions are disabled.",
  404: "The submission does not exist, or you are not allowed to read it.",
};
type ReqParams = { Params: z.infer<typeof submissionParamsSchema> };

async function handler(req: FastifyRequest<ReqParams>, res: ReplyPayload<JSONBody<SubmissionPhoto[]>>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FEATURE_DISABLED");
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  const submission = await findReadableSubmission(req, req.params.id, userId);

  return res.send({ data: await listSubmissionPhotos(submission.id, await loadUserRefViewer(req)) });
}

const getSubmissionPhotos: Route<ReqParams, SubmissionPhoto[]> = {
  url: "/submissions/:id/photos",
  method: "GET",
  config: { permissions: ["read:submissions"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getSubmissionPhotos;
