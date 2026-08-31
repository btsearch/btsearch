import { UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { SubmissionDetail } from "@/features/admin/submissions/types";
import i18n from "@/i18n/config";
import { formatFullDate, resolveAvatarUrl } from "@/lib/format";

export function SubmitterCard({ submission }: { submission: SubmissionDetail }) {
  const { t } = useTranslation("submissions");

  return (
    <div className="border rounded-xl overflow-hidden bg-card">
      <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center gap-2">
        <HugeiconsIcon icon={UserIcon} className="size-4 text-muted-foreground" />
        <span className="font-semibold text-sm">{t("detail.submitter")}</span>
      </div>
      <div className="px-4 py-3 space-y-4">
        <div className="flex items-start gap-4">
          <Avatar className="size-10 border">
            {submission.submitter ? (
              <>
                <AvatarImage src={resolveAvatarUrl(submission.submitter.image)} />
                <AvatarFallback>{submission.submitter.name.charAt(0).toUpperCase()}</AvatarFallback>
              </>
            ) : (
              <AvatarFallback>
                <HugeiconsIcon icon={UserIcon} className="size-4 text-muted-foreground" />
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-sm font-medium leading-none truncate">{submission.submitter?.name ?? t("detail.deletedUser")}</p>
            {submission.submitter?.username && <p className="text-xs text-muted-foreground truncate">@{submission.submitter.username}</p>}
            {submission.createdAt && (
              <p className="text-[11px] text-muted-foreground/70">
                {t("detail.createdAt")}: {formatFullDate(submission.createdAt, i18n.language)}
              </p>
            )}
          </div>
        </div>
        {submission.submitter_note ? (
          <div className="border-l-4 border-primary/40 bg-primary/5 rounded-r-lg p-3 space-y-1">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{t("detail.submitterNotes")}</p>
            <p className="text-sm leading-relaxed wrap-break-word whitespace-pre-wrap">{submission.submitter_note}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{t("detail.noSubmitterNote")}</p>
        )}
      </div>
    </div>
  );
}
