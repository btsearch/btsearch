import { submissionParamsSchema, submissionReviewSchema, submissionSchema } from "@openbts/shared/contract";
import type { Submission, SubmissionReview } from "@openbts/shared/contract";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import { actorIdFromRequest } from "../../../../../features/access/access.js";
import { defineScope } from "../../../../../features/access/scope.js";
import { approveSubmissionAction, rejectSubmissionAction } from "../../../../../features/submissions/actions.js";
import { serializeSubmissions } from "../../../../../features/submissions/serialize.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { getRuntimeSettings } from "../../../../../lib/runtimeSettings.js";

const schemaRoute = {
  summary: "Review a submission",
  description:
    "Approves or rejects a pending submission and returns it. " +
    "Approving applies all of its changes to the data at once and sets the status to `accepted`. " +
    "Rejecting changes nothing and sets the status to `rejected`. " +
    "Approving the removal of a station marks the station `inactive` instead of deleting it. " +
    "If the submission proposes a new structure owner in `ownerName`, approving it also adds that owner to the list of structure owners " +
    "for the location's country, unless an owner with that name already exists there or among the owners without a country. " +
    "The submitter is notified either way, and `note` is saved as the review note.\n\n" +
    "Editors can only review a submission if their grant covers everything it touches. " +
    "Send `expectedUpdatedAt` with the `updatedAt` you last saw to make sure nobody changed the submission in the meantime.\n\n" +
    "Photos uploaded to a rejected submission are deleted 30 days later.",
  params: submissionParamsSchema,
  body: submissionReviewSchema,
  response: {
    200: z.object({
      data: submissionSchema,
    }),
  },
};
const errorReasons = {
  400:
    "The request is invalid, or the submission has already been reviewed. " +
    "Approving can also fail because the changes no longer fit the current data, and the message tells you why.",
  403:
    "You are not an editor or an administrator, or your grant does not cover everything the submission touches. " +
    "Editors also get this for a submission that does not exist, and everyone gets it while submissions are disabled.",
  404: "The submission does not exist. Also returned on approval when its station has become `inactive`.",
  409:
    "The submission changed after `expectedUpdatedAt`, or someone else changed or reviewed it while your request was being processed. " +
    "Also returned on approval when a cell or the new station it adds already exists, when it would change a cell's technology, " +
    "when a cell it changes is on another station, or when another request added the proposed structure owner at the same moment.",
};
type RequestData = { Params: z.infer<typeof submissionParamsSchema>; Body: SubmissionReview };

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<Submission>>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FEATURE_DISABLED");
  const reviewerId = actorIdFromRequest(req);
  if (reviewerId === null) throw new ErrorResponse("UNAUTHORIZED");

  const { decision, note, expectedUpdatedAt } = req.body;
  const review = {
    submissionId: req.params.id,
    reviewerId,
    reviewerNotes: note,
    expectedUpdatedAt: expectedUpdatedAt === undefined ? undefined : new Date(expectedUpdatedAt),
    req,
  };
  const reviewed = decision === "approve" ? (await approveSubmissionAction(review)).submission : await rejectSubmissionAction(review);

  const [submission] = await serializeSubmissions(req, [reviewed]);
  if (!submission) throw new ErrorResponse("NOT_FOUND");

  return res.send({ data: submission });
}

const reviewSubmission: Route<RequestData, Submission> = {
  url: "/submissions/:id/review",
  method: "PUT",
  config: {
    permissions: ["moderate:submissions"],
    scope: defineScope<RequestData>((req) => ({ submissionIds: [req.params.id] })),
    errorReasons,
  },
  schema: schemaRoute,
  handler,
};

export default reviewSubmission;
