import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SUBMISSION_STATUS } from "@/features/admin/submissions/submissionUI";
import type { SubmissionListItem } from "@/features/admin/submissions/types";
import { countCellOperations } from "@/features/admin/submissions/utils";
import { SubmissionTypeBadge } from "@/features/submissions/components/submissionTypeBadge";
import { formatFullDate, formatRelativeTime, resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Operator } from "@/types/station";

import { StationIdentityCell } from "./stationIdentityCell";

type GetOperatorById = (operatorId: number | null | undefined) => Operator | undefined;

export function getSubmissionStationId(submission: SubmissionListItem) {
  return submission.station?.station_id ?? submission.proposedStation?.station_id ?? null;
}

export function SubmissionStationSummary({ submission, getOperatorById }: { submission: SubmissionListItem; getOperatorById: GetOperatorById }) {
  const { t } = useTranslation("common");
  const station = submission.station;
  const proposedStation = submission.proposedStation;

  return (
    <div className="min-w-0 space-y-1">
      <StationIdentityCell
        stationId={station?.station_id ?? proposedStation?.station_id ?? null}
        operator={getOperatorById(station?.operator_id ?? proposedStation?.operator_id)}
        fallback={t("labels.newStation")}
      />
      <span className="block truncate font-mono text-[11px] text-muted-foreground" title={submission.id}>
        {submission.id.slice(-8)}
      </span>
    </div>
  );
}

export function SubmissionChangesSummary({ submission }: { submission: SubmissionListItem }) {
  const { t } = useTranslation("submissions");
  const { added, modified, deleted } = countCellOperations(submission.cells);
  const label = t("table.cellCountsLabel", { added, updated: modified, deleted });

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <SubmissionTypeBadge type={submission.type} />
      <span
        className="inline-flex items-center rounded-md bg-muted px-2 py-1 font-mono text-xs font-semibold tabular-nums"
        aria-label={label}
        title={`${t("table.cellCountsLegend")}: ${label}`}
      >
        <span className="text-emerald-700 dark:text-emerald-400">{added}</span>
        <span className="px-0.5 text-muted-foreground">/</span>
        <span className="text-amber-800 dark:text-amber-400">{modified}</span>
        <span className="px-0.5 text-muted-foreground">/</span>
        <span className="text-red-700 dark:text-red-400">{deleted}</span>
      </span>
    </div>
  );
}

export function SubmissionSubmitterSummary({ submission }: { submission: SubmissionListItem }) {
  const submitter = submission.submitter;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Avatar className="size-7 shrink-0">
        <AvatarImage src={resolveAvatarUrl(submitter.image)} />
        <AvatarFallback className="text-[10px]">{submitter.name.charAt(0).toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{submitter.name}</div>
        {submitter.username ? <div className="truncate text-xs text-muted-foreground">@{submitter.username}</div> : null}
      </div>
    </div>
  );
}

export function SubmissionTimestamp({ value, showLabel = false }: { value: string; showLabel?: boolean }) {
  const { t: tCommon, i18n } = useTranslation("common");
  const exactDate = formatFullDate(value, i18n.language);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className="inline-flex cursor-help items-center gap-1 text-xs tabular-nums text-muted-foreground underline decoration-dotted underline-offset-4"
            title={exactDate}
          />
        }
      >
        {showLabel ? `${tCommon("labels.submitted")}: ` : null}
        {formatRelativeTime(value, tCommon)}
      </TooltipTrigger>
      <TooltipContent>{exactDate}</TooltipContent>
    </Tooltip>
  );
}

export function SubmissionStatusSummary({ submission, inline = false }: { submission: SubmissionListItem; inline?: boolean }) {
  const { t: tCommon, i18n } = useTranslation("common");
  const status = SUBMISSION_STATUS[submission.status];
  const reviewedAt = submission.reviewed_at;

  return (
    <div className={cn("min-w-0", inline ? "flex items-center gap-2" : "space-y-1.5")}>
      <div className={cn("flex w-fit items-center gap-1.5 rounded-md px-2 py-1", status.bgClass)}>
        <HugeiconsIcon icon={status.icon} className={cn("size-3.5", status.iconClass)} />
        <span className="text-xs font-medium">{tCommon(`status.${submission.status}`)}</span>
      </div>
      {reviewedAt ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  "inline-block max-w-full cursor-help truncate text-[11px] leading-4 tabular-nums text-muted-foreground underline decoration-dotted underline-offset-4",
                  inline && "max-w-20",
                )}
                title={formatFullDate(reviewedAt, i18n.language)}
              />
            }
          >
            {formatRelativeTime(reviewedAt, tCommon)}
          </TooltipTrigger>
          <TooltipContent>{formatFullDate(reviewedAt, i18n.language)}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}
