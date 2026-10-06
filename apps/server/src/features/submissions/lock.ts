import { submissions } from "@openbts/drizzle";
import { eq } from "drizzle-orm";

import type { DbTx } from "../../types/global.js";
import type { SubmissionRow } from "./read.js";

export type LockedSubmission = Pick<SubmissionRow, "status" | "updatedAt">;

export async function lockSubmission(tx: DbTx, id: string): Promise<LockedSubmission | undefined> {
  const [locked] = await tx
    .select({ status: submissions.status, updatedAt: submissions.updatedAt })
    .from(submissions)
    .where(eq(submissions.id, id))
    .for("update")
    .limit(1);
  return locked;
}
