import { UserCheck02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SubmissionDetail } from "@/features/admin/submissions/types";
import { UserLink } from "@/features/user-profile/components/userLink";
import { formatFullDate, resolveAvatarUrl } from "@/lib/format";

type AdminReviewCardProps = {
  submission: SubmissionDetail;
  reviewNotes: string;
  onReviewNotesChange: (value: string) => void;
  isReadOnly: boolean;
};

export function AdminReviewCard({ submission, reviewNotes, onReviewNotesChange, isReadOnly }: AdminReviewCardProps) {
  const { t, i18n } = useTranslation("submissions");

  const isReviewed = isReadOnly && submission.reviewer;
  const reviewer = submission.reviewer;

  if (isReviewed && reviewer) {
    return (
      <div className="border rounded-xl overflow-hidden bg-card">
        <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center gap-2">
          <HugeiconsIcon icon={UserCheck02Icon} className="size-4 text-muted-foreground" />
          <span className="font-semibold text-sm">{t("detail.reviewer")}</span>
        </div>
        <div className="px-4 py-3 space-y-4">
          <div className="flex items-start gap-4">
            <Avatar className="size-10 border">
              <AvatarImage src={resolveAvatarUrl(reviewer.image)} />
              <AvatarFallback>{reviewer.name.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 space-y-1">
              <UserLink user={reviewer} className="block w-fit max-w-full truncate text-sm leading-4 font-medium">
                {reviewer.name}
              </UserLink>
              {reviewer.username && <p className="text-xs text-muted-foreground truncate">@{reviewer.username}</p>}
              {submission.reviewed_at && (
                <p className="text-[11px] text-muted-foreground/70">
                  {t("detail.reviewedAt")}: {formatFullDate(submission.reviewed_at, i18n.language)}
                </p>
              )}
            </div>
          </div>
          {submission.review_notes ? (
            <div className="border-l-4 border-primary/40 bg-primary/5 rounded-r-lg p-3 space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("detail.reviewNotes")}</p>
              <p className="text-sm leading-relaxed wrap-break-word">{submission.review_notes}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t("detail.noReviewerResponse")}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center gap-2">
        <HugeiconsIcon icon={UserCheck02Icon} className="size-4 text-muted-foreground" />
        <span className="font-semibold text-sm">{t("detail.reviewer")}</span>
      </div>
      <div className="p-4 space-y-2">
        <Label>{t("detail.reviewNotes")}</Label>
        <Textarea
          value={reviewNotes}
          onChange={(e) => onReviewNotesChange(e.target.value)}
          placeholder={t("detail.reviewNotesPlaceholder")}
          rows={4}
        />
      </div>
    </div>
  );
}
