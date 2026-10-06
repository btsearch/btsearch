import { ArrowUpRight01Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Operator } from "@openbts/shared/contract";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { EditCard } from "./editCard";
import { InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { stationHistoryQueryOptions } from "@/features/station-details/station/history/api";
import { groupHistoryByDay } from "@/features/station-details/station/history/entries";
import { HistoryEntry } from "@/features/station-details/station/history/historyEntry";
import { useHistoryNames } from "@/features/station-details/station/history/lookups";
import { toV1OperatorMnc } from "@/features/station-details/station/utils/stations";
import { cn } from "@/lib/utils";

type HistoryCardStation = {
  id: number;
  siteId: string;
  operator: Pick<Operator, "name" | "primaryPlmn"> | null;
};

type HistoryCardProps = {
  station: HistoryCardStation;
  markedSince?: string | null;
};

const SHOWN_OPERATIONS = 4;
const SKELETON_ROWS = [0, 1, 2];
const OPEN_ALL_CLASS = cn(
  "flex cursor-pointer items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none transition-colors",
  "hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50",
);
const MARK_CLASS = "absolute inset-y-2.5 -left-2.5 w-0.5 rounded-full bg-amber-500";

function ignoreRevert(): void {}

function HistorySkeleton() {
  const { t } = useTranslation("common");

  return (
    <>
      <output className="sr-only">{t("actions.loading")}</output>
      <div className="divide-y divide-border/60" aria-hidden="true">
        {SKELETON_ROWS.map((row) => (
          <div key={row} className="flex gap-2.5 py-2.5">
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-3 w-full max-w-64" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function HistoryCard({ station, markedSince = null }: HistoryCardProps) {
  const { t, i18n } = useTranslation(["stations", "stationDetails", "common", "main"]);
  const { openStationHistoryDialog } = useFloatingDialogStack();
  const names = useHistoryNames();
  const { data, isError, isPending, isRefetching, refetch } = useInfiniteQuery(stationHistoryQueryOptions(station.id));

  function openWholeHistory() {
    openStationHistoryDialog({
      stationId: station.id,
      stationCode: station.siteId,
      operatorName: station.operator?.name ?? t("main:unknownOperator"),
      operatorMnc: toV1OperatorMnc(station.operator),
    });
  }

  const operations = (data?.pages.flatMap((page) => page.data) ?? []).slice(0, SHOWN_OPERATIONS);
  const groups = groupHistoryByDay(operations, i18n.language);
  const markedFrom = markedSince === null ? null : Date.parse(markedSince);
  const markLabel = t("edit.historyCard.afterSubmission");

  return (
    <EditCard
      title={t("edit.historyCard.title")}
      icon={Clock01Icon}
      isCollapsible
      actions={
        <button type="button" onClick={openWholeHistory} className={OPEN_ALL_CLASS}>
          {t("edit.historyCard.openAll")}
          <HugeiconsIcon icon={ArrowUpRight01Icon} aria-hidden="true" className="size-3" />
        </button>
      }
    >
      <div className="px-4 py-1.5" aria-busy={isPending}>
        {isPending ? <HistorySkeleton /> : null}
        {isError && operations.length === 0 ? (
          <InlineError className="my-1.5" title={t("stationDetails:history.error")} onRetry={() => refetch()} isRetrying={isRefetching} />
        ) : null}
        {!isPending && !isError && operations.length === 0 ? (
          <p className="py-1.5 text-sm text-muted-foreground">{t("common:empty.changes")}</p>
        ) : null}
        {groups.map((group) => (
          <section key={group.key} aria-label={group.label}>
            <h3 className="pt-1.5 text-xs font-medium text-muted-foreground">{group.label}</h3>
            <div className="divide-y divide-border/60">
              {group.entries.map((entry) => (
                <div key={entry.key} className="relative">
                  {markedFrom !== null && Date.parse(entry.item.createdAt) > markedFrom ? (
                    <span role="img" aria-label={markLabel} title={markLabel} className={MARK_CLASS} />
                  ) : null}
                  <HistoryEntry
                    item={entry.item}
                    part={{ ...entry.part, isRevertible: false }}
                    revertParts={entry.revertParts}
                    names={names}
                    canOpenAuditLog={false}
                    onRevert={ignoreRevert}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </EditCard>
  );
}
