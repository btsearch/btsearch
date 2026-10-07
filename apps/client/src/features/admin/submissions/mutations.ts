import type { SubmissionReview, SubmissionUpdate } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { invalidateStructureOwners } from "@/features/admin/reference/api/queryKeys";
import { createConservativeStationImpact, invalidateStationUpdateQueries } from "@/features/admin/stations/queries";
import { invalidateSubmissionQueries, reviewSubmission, storeSubmission, updateSubmission } from "@/features/station-editing/data/submissions";
import type { AuditOperationHandle } from "@/lib/api";

type SubmissionSave = {
  submissionId: string;
  body: SubmissionUpdate;
  auditOperation?: AuditOperationHandle;
};

type SubmissionDecision = {
  submissionId: string;
  review: SubmissionReview;
  createsOwner: boolean;
  auditOperation: AuditOperationHandle;
};

export function useSaveSubmissionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ submissionId, body, auditOperation }: SubmissionSave) => updateSubmission(submissionId, body, auditOperation),
    onSuccess: (submission) => {
      storeSubmission(queryClient, submission);
      void invalidateSubmissionQueries(queryClient, submission.id);
    },
  });
}

export function useReviewSubmissionMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ submissionId, review, auditOperation }: SubmissionDecision) => reviewSubmission(submissionId, review, auditOperation),
    onSuccess: (submission, { review, createsOwner }) => {
      storeSubmission(queryClient, submission);
      void invalidateSubmissionQueries(queryClient, submission.id);
      if (review.decision !== "approve") return;

      invalidateStationUpdateQueries(queryClient, createConservativeStationImpact(submission.stationId), { conservative: true });
      if (createsOwner) void invalidateStructureOwners(queryClient);
    },
  });
}
