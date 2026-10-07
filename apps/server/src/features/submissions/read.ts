import { submissions } from "@openbts/drizzle";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { requestOverlaps } from "../access/scope.js";
import { hasStaffPermission } from "../access/staff.js";
import type { submissionsSelectSchema } from "./create.js";

export type SubmissionRow = z.infer<typeof submissionsSelectSchema>;

export async function findSubmission(id: string): Promise<SubmissionRow | undefined> {
  const [submission] = await db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
  return submission;
}

export function canReadAllSubmissions(req: FastifyRequest): Promise<boolean> {
  return hasStaffPermission(req, { submissions: ["read_all"] });
}

export async function findReadableSubmission(req: FastifyRequest, id: string, userId: string): Promise<SubmissionRow> {
  const [canReadAll, submission] = await Promise.all([canReadAllSubmissions(req), findSubmission(id)]);

  if (!submission) throw new ErrorResponse("NOT_FOUND");
  if (submission.submitter_id === userId) return submission;
  if (!canReadAll || !(await requestOverlaps(req, { submissionIds: [id] }))) throw new ErrorResponse("NOT_FOUND");

  return submission;
}
