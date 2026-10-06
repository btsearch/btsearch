import { UserCheck02Icon } from "@hugeicons/core-free-icons";
import type { Submission } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { ReviewNoteField } from "./reviewNoteField";
import { SubmissionPerson } from "./submitterCard";
import { EditCard } from "@/features/station-editing/components/frame/editCard";

type AdminReviewCardProps = {
  submission: Pick<Submission, "reviewer" | "reviewedAt" | "reviewNote">;
  reviewNote: string;
  onReviewNoteChange: (value: string) => void;
  isReadOnly: boolean;
};

export function AdminReviewCard({ submission, reviewNote, onReviewNoteChange, isReadOnly }: AdminReviewCardProps) {
  const { t } = useTranslation("submissions");

  return (
    <EditCard title={t("detail.reviewer")} icon={UserCheck02Icon} className="bg-card">
      {isReadOnly ? (
        <SubmissionPerson
          user={submission.reviewer}
          dateLabel={t("detail.reviewedAt")}
          date={submission.reviewedAt}
          noteLabel={t("detail.reviewNotes")}
          note={submission.reviewNote}
          emptyNote={t("detail.noReviewerResponse")}
        />
      ) : (
        <div className="p-4">
          <ReviewNoteField
            label={t("detail.reviewNotes")}
            placeholder={t("detail.reviewNotesPlaceholder")}
            value={reviewNote}
            onChange={onReviewNoteChange}
            rows={4}
          />
        </div>
      )}
    </EditCard>
  );
}
