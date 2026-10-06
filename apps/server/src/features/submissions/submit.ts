import type { FastifyRequest } from "fastify";

import { ErrorResponse } from "../../errors.js";
import { pointRefusalsAtItem } from "../../lib/itemRefusals.js";
import { logger } from "../../utils/logger.js";
import { auditContextFromRequest, loadSubmissionDraftSnapshot, runAuditedOperation } from "../audit/index.js";
import { notifyStaffNewSubmission } from "../notifications/service.js";
import { assertContributionsOpen } from "./contributions.js";
import { type SingleSubmission, type SubmissionWithExtras, processSubmission, validateSubmission } from "./create.js";
import { getSubmissionStationLabels } from "./stationLabels.js";

export type Submitter = { id: string; name: string };

export async function submitSubmissions(
  req: FastifyRequest,
  changes: readonly SingleSubmission[],
  submitter: Submitter,
): Promise<SubmissionWithExtras[]> {
  await assertContributionsOpen(req, changes);
  await Promise.all(changes.map((change, index) => pointRefusalsAtItem(index, () => validateSubmission(change))));

  try {
    const created = await runAuditedOperation(auditContextFromRequest(req), { kind: "submission.create" }, async (tx, audit) => {
      const submissions: SubmissionWithExtras[] = [];
      for (const [index, change] of changes.entries()) {
        // eslint-disable-next-line no-await-in-loop
        submissions.push(await pointRefusalsAtItem(index, () => processSubmission(tx, change, submitter.id)));
      }
      await audit.logMany(
        await Promise.all(
          submissions.map(async (submission) => {
            const snapshot = await loadSubmissionDraftSnapshot(tx, submission.id);
            if (!snapshot) throw new ErrorResponse("FAILED_TO_CREATE");
            return {
              entity: "submissions" as const,
              op: "create" as const,
              recordId: submission.id,
              stationId: submission.station_id,
              new: snapshot,
            };
          }),
        ),
      );
      return submissions;
    });

    const stationLabels = await getSubmissionStationLabels(created);

    for (const submission of created) {
      if (
        submission.pending_photos &&
        !submission.proposedStation &&
        !submission.proposedLocation &&
        (!submission.cells || submission.cells.length === 0) &&
        !submission.submitter_note
      ) {
        continue;
      }

      void notifyStaffNewSubmission({
        submissionId: submission.id,
        submitterName: submitter.name,
        submissionType: submission.type ?? "new",
        station: stationLabels.get(submission.id),
      }).catch((e) => logger.error("Failed to notify staff about new submission", { error: e }));
    }

    return created;
  } catch (error) {
    if (error instanceof ErrorResponse) throw error;
    throw new ErrorResponse("INTERNAL_SERVER_ERROR", { cause: error });
  }
}
