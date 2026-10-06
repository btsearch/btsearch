import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { formatAllowanceWait } from "../data/allowance";
import type { SelectionProblem, SelectionSummary } from "../model/selection";
import { Button } from "@/components/ui/button";
import { CloseButton } from "@/components/ui/close-button";
import { useNow } from "@/hooks/useNow";
import { cn } from "@/lib/utils";

type SelectionBarProps = {
  summary: SelectionSummary;
  stationCap: number;
  problem: SelectionProblem | null;
  isPageTicked: boolean;
  isCompact?: boolean;
  onTickAllMatching: () => void;
  onClear: () => void;
  onOpenBatch: () => void;
};

type ProblemTextProps = {
  problem: SelectionProblem;
};

type AllowanceWaitProps = {
  limit: number;
  resetsAt: string | null;
};

const BAR_CLASS = "flex w-full min-w-0 items-center gap-2 border pr-1.5 pl-1";
const BAR_TONE_CLASSES = { plain: "border-primary/30 bg-primary/5", problem: "border-destructive/30 bg-destructive/5" };
const COUNT_CLASS = "text-[12.5px] leading-4 font-semibold tabular-nums";
const NOTE_CLASS = "text-[11px] leading-[14px]";
const TICK_ALL_CLASS = cn(
  "min-w-0 cursor-pointer truncate rounded-sm font-semibold text-primary underline-offset-2 outline-none hover:underline",
  "focus-visible:ring-2 focus-visible:ring-ring",
);

function AllowanceWait({ limit, resetsAt }: AllowanceWaitProps) {
  const { t } = useTranslation("cellAnalyzer");
  const now = useNow();
  const waitMs = resetsAt === null ? null : Date.parse(resetsAt) - now;

  if (waitMs === null || !Number.isFinite(waitMs)) return t("selection.allowanceUsedUpNoWait", { limit });
  return t("selection.allowanceUsedUp", { limit, wait: formatAllowanceWait(waitMs, t) });
}

function ProblemText({ problem }: ProblemTextProps) {
  const { t } = useTranslation("cellAnalyzer");

  if (problem.kind === "overStationCap") return t("selection.reviewBatchDisabledOverLimit", { count: problem.cap });
  if (problem.kind === "overAllowance") return t("selection.reviewBatchDisabledOverLimit", { count: problem.remaining });
  return <AllowanceWait limit={problem.limit} resetsAt={problem.resetsAt} />;
}

export function SelectionBar({
  summary,
  stationCap,
  problem,
  isPageTicked,
  isCompact = false,
  onTickAllMatching,
  onClear,
  onOpenBatch,
}: SelectionBarProps) {
  const { t } = useTranslation("cellAnalyzer");
  const hasProblem = problem !== null;
  const tickedMatchingCount = summary.rowCount - summary.outsideCount;
  const canTickAllMatching = isPageTicked && summary.matchingCount > summary.pageCount && tickedMatchingCount < summary.matchingCount;
  const countText = t("selection.count", {
    stationCount: summary.stationCount,
    cap: stationCap,
    changes: t("selection.changes", { count: summary.rowCount }),
  });
  const toneClass = hasProblem ? BAR_TONE_CLASSES.problem : BAR_TONE_CLASSES.plain;
  const clearButton = <CloseButton label={t("selection.clearSelection")} className="shrink-0" onClick={onClear} />;
  const openButton = (
    <Button type="button" size="sm" disabled={hasProblem} className="shrink-0 font-semibold" onClick={onOpenBatch}>
      {t("selection.goToSubmission")}
      <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" aria-hidden="true" />
    </Button>
  );

  if (isCompact) {
    return (
      <div role="region" aria-label={t("selection.region")} className={cn(BAR_CLASS, "min-h-11 flex-wrap rounded-xl", toneClass)}>
        {clearButton}
        <p className={cn("min-w-0 flex-1 truncate", COUNT_CLASS, hasProblem ? "text-destructive" : null)}>{countText}</p>
        {openButton}
        {problem === null ? null : (
          <p role="alert" className={cn("basis-full pb-1.5 pl-9 text-destructive", NOTE_CLASS)}>
            <ProblemText problem={problem} />
          </p>
        )}
      </div>
    );
  }

  return (
    <div role="region" aria-label={t("selection.region")} className={cn(BAR_CLASS, "h-10 max-w-165 rounded-lg", toneClass)}>
      {clearButton}
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-px">
        <p className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
          <span className={cn(COUNT_CLASS, hasProblem ? "text-destructive" : null)}>{countText}</span>
          {summary.outsideCount > 0 ? (
            <span className={cn("min-w-0 truncate text-muted-foreground", NOTE_CLASS)}>
              {t("selection.outsideFilter", { count: summary.outsideCount })}
            </span>
          ) : null}
        </p>
        {problem === null ? null : (
          <p role="alert" className={cn("truncate text-destructive", NOTE_CLASS)}>
            <ProblemText problem={problem} />
          </p>
        )}
        {!hasProblem && canTickAllMatching ? (
          <p className={cn("flex min-w-0 items-baseline gap-1 whitespace-nowrap text-muted-foreground", NOTE_CLASS)}>
            <span className="shrink-0">{t("selection.pageTicked", { count: summary.pageCount })}</span>
            <span aria-hidden="true">-</span>
            <button type="button" className={TICK_ALL_CLASS} onClick={onTickAllMatching}>
              {t("selection.selectAllMatching", { count: summary.matchingCount })}
            </button>
          </p>
        ) : null}
      </div>
      {openButton}
    </div>
  );
}
