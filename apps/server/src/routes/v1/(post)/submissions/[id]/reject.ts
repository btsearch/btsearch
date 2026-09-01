import { submissions } from "@openbts/drizzle";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify/types/request.js";
import { z } from "zod/v4";

import { ErrorResponse } from "../../../../../errors.js";
import type { ReplyPayload } from "../../../../../interfaces/fastify.interface.js";
import type { JSONBody, Route } from "../../../../../interfaces/routes.interface.js";
import { verifyPermissions } from "../../../../../plugins/auth/utils.js";
import { getRuntimeSettings } from "../../../../../services/settings.service.js";
import { rejectSubmissionAction } from "../../../../../services/submissions/actions.js";

const submissionsSelectSchema = createSelectSchema(submissions);

const schemaRoute = {
  params: z.object({
    id: z.coerce.string<string>(),
  }),
  body: z
    .object({
      review_notes: z.string().nullable().optional(),
    })
    .optional(),
  response: {
    200: z.object({
      data: submissionsSelectSchema,
    }),
  },
};

type ReqParams = { Params: { id: string } };
type ReqBody = { Body: { review_notes?: string } | undefined };
type RequestData = ReqParams & ReqBody;
type ResponseData = z.infer<typeof submissionsSelectSchema>;

async function handler(req: FastifyRequest<RequestData>, res: ReplyPayload<JSONBody<ResponseData>>) {
  if (!getRuntimeSettings().submissionsEnabled) throw new ErrorResponse("FORBIDDEN");
  const { id } = req.params;
  const session = req.userSession;
  if (!session?.user) throw new ErrorResponse("UNAUTHORIZED");
  const hasPermission = await verifyPermissions(session.user.id, { submissions: ["update"] });
  if (!hasPermission) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");
  const result = await rejectSubmissionAction({
    submissionId: id,
    reviewerId: session.user.id,
    reviewerNotes: req.body?.review_notes,
    req,
  });

  return res.send({ data: result });
}

const rejectSubmission: Route<RequestData, ResponseData> = {
  url: "/submissions/:id/reject",
  method: "POST",
  config: { permissions: ["update:submissions"] },
  schema: schemaRoute,
  handler,
};

export default rejectSubmission;
