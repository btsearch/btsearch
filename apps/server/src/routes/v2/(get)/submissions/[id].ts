import { submissionParamsSchema, submissionQuerySchema, submissionSchema } from "@openbts/shared/contract";
import type { Submission, SubmissionQuery } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../errors.js";
import { actorIdFromRequest } from "../../../../features/access/access.js";
import { findReadableSubmission } from "../../../../features/submissions/read.js";
import { serializeSubmissions } from "../../../../features/submissions/serialize.js";
import type { ReplyPayload } from "../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../lib/runtimeSettings.js";

const schemaRoute = {
  summary: "Get a submission",
  description:
    "Returns one submission with the changes it proposes. " +
    "You can read it if you are its submitter, an administrator, or an editor whose grant covers at least one station or place it touches. " +
    "`include=station` adds the station the submission changes, and `include=station.location` adds it together with the location it is at now. " +
    "`station` is `null` if the submission has no station yet or the station is in a country you cannot access.",
  params: submissionParamsSchema,
  querystring: submissionQuerySchema,
  response: {
    200: z.object({
      data: submissionSchema,
    }),
  },
};
const errorReasons = {
  403: "Submissions are disabled.",
  404: "The submission does not exist, or you are not allowed to read it.",
};
type RequestData = { Params: z.infer<typeof submissionParamsSchema>; Querystring: SubmissionQuery };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Submission>>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FEATURE_DISABLED");
  const userId = actorIdFromRequest(req);
  if (userId === null) throw new ErrorResponse("UNAUTHORIZED");

  const row = await findReadableSubmission(req, req.params.id, userId);
  const [submission] = await serializeSubmissions(req, [row], req.query.include);
  if (!submission) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: submission });
}

const getSubmission: Route<RequestData, Submission> = {
  url: "/submissions/:id",
  method: "GET",
  config: { permissions: ["read:submissions"], errorReasons },
  schema: schemaRoute,
  handler,
};

export default getSubmission;
