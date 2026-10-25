import type { IconSvgElement } from "@hugeicons/react";
import type { ObservationFlag, ObservationFlagSort, ObservationFlagStatus } from "@openbts/shared/contract";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { EstimatedLabel, FlagSubjectMark } from "../components/flagSubjectMark";
import { type FlagTextContext, getClosedSummary, getFlagSubject, getFlagSummary, getFlagTime, getRegionName } from "../model/flagText";
import { getKindLabel } from "../model/kinds";
import { QUEUE_SORTS } from "./queueSearch";
import { Button } from "@/components/ui/button";
import { ErrorState, STALE_NOTICE_CORNER_CLASS, StaleDataNotice } from "@/components/ui/error-state";
import { RelativeTime } from "@/components/ui/relative-time";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { getOperatorLook } from "@/features/map/data/mapLookups";
import { cn } from "@/lib/utils";

export type FlagListView = "loading" | "error" | "empty" | "rows";

export type FlagListEmpty = { title: string; description: string | null; icon: IconSvgElement; action: ReactNode };

type FlagListProps = {
  status: ObservationFlagStatus;
  flags: readonly ObservationFlag[];
  total: number | null;
  view: FlagListView;
  empty: FlagListEmpty;
  selectedFlagId: number | null;
  sort: ObservationFlagSort;
  hasStaleRows: boolean;
  isFetching: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  ctx: FlagTextContext;
  className?: string;
  onSortChange: (sort: ObservationFlagSort) => void;
  onSelect: (flagId: number) => void;
  onShowMore: () => void;
  onRetry: () => void;
};

type FlagRowProps = {
  flag: ObservationFlag;
  isSelected: boolean;
  ctx: FlagTextContext;
  onSelect: (flagId: number) => void;
};

const SKELETON_ROWS = [
  ["w-[38%]", "w-[74%]"],
  ["w-[30%]", "w-[62%]"],
  ["w-[44%]", "w-[70%]"],
  ["w-[34%]", "w-[58%]"],
  ["w-[40%]", "w-[76%]"],
  ["w-[28%]", "w-[54%]"],
  ["w-[42%]", "w-[66%]"],
  ["w-[36%]", "w-[60%]"],
] as const;
const SORT_KEYS: Record<(typeof QUEUE_SORTS)[number], string> = {
  "-createdAt": "newest",
  createdAt: "oldest",
  "-updatedAt": "updated",
  stationId: "station",
};

function isQueueSort(value: unknown): value is (typeof QUEUE_SORTS)[number] {
  return QUEUE_SORTS.some((sort) => sort === value);
}

function FlagRow({ flag, isSelected, ctx, onSelect }: FlagRowProps) {
  const { t } = ctx;
  const subject = getFlagSubject(flag, ctx);
  const { operator, brand } = getOperatorLook(ctx.lookups, subject.operatorId);
  const region = getRegionName(flag, ctx.lookups);
  const kind = getKindLabel(flag.kind, t);
  const summary = flag.status === "open" ? getFlagSummary(flag, ctx) : getClosedSummary(flag, ctx);

  return (
    <li className="border-b last:border-b-0">
      <button
        type="button"
        aria-pressed={isSelected}
        aria-label={[kind, subject.text, region].filter((part) => part !== "").join(", ")}
        onClick={() => onSelect(flag.id)}
        className={cn(
          "flex min-h-14 w-full cursor-pointer flex-col justify-center gap-0.5 px-4 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
          isSelected ? "bg-muted" : "hover:bg-muted/50",
        )}
      >
        <span className="flex w-full min-w-0 items-center gap-2">
          <FlagSubjectMark subject={subject} operator={operator} brand={brand} size={16} />
          <span className={cn("min-w-0 truncate text-[13px] leading-5 tabular-nums", subject.isMono ? "font-mono font-semibold" : "font-medium")}>
            {subject.text}
          </span>
          {subject.isEstimated ? <EstimatedLabel /> : null}
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{region}</span>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            <RelativeTime date={getFlagTime(flag)} />
          </span>
        </span>
        <span className="block w-full truncate text-xs leading-4 text-muted-foreground">
          <span className="font-semibold text-foreground/80">{kind}</span>
          {summary === "" ? null : ` · ${summary}`}
        </span>
      </button>
    </li>
  );
}

function ListSkeleton() {
  const { t } = useTranslation("common");

  return (
    <div role="status" aria-label={t("actions.loading")} className="min-h-0 flex-1">
      {SKELETON_ROWS.map(([first, second]) => (
        <div key={first + second} aria-hidden="true" className="flex h-[58px] flex-col justify-center gap-2 border-b px-4">
          <span className="flex items-center gap-2">
            <Skeleton className="size-4" />
            <Skeleton className={cn("h-2.5", first)} />
            <Skeleton className="ml-auto h-2.5 w-13" />
          </span>
          <Skeleton className={cn("h-2.5", second)} />
        </div>
      ))}
    </div>
  );
}

export function FlagList({
  status,
  flags,
  total,
  view,
  empty,
  selectedFlagId,
  sort,
  hasStaleRows,
  isFetching,
  hasMore,
  isFetchingMore,
  ctx,
  className,
  onSortChange,
  onSelect,
  onShowMore,
  onRetry,
}: FlagListProps) {
  const { t, i18n } = useTranslation(["admin", "common"]);
  const sortLabel = isQueueSort(sort) ? t(`observationFlags.sort.${SORT_KEYS[sort]}`) : t("observationFlags.sort.newest");

  let body: ReactNode;
  if (view === "loading") {
    body = <ListSkeleton />;
  } else if (view === "error") {
    body = (
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <ErrorState className="flex-1" onRetry={onRetry} isRetrying={isFetching} />
      </div>
    );
  } else if (view === "empty") {
    body = (
      <div role="status" className="flex min-h-0 flex-1 flex-col p-3">
        <ErrorState
          tone="neutral"
          className="flex-1"
          icon={empty.icon}
          title={empty.title}
          description={empty.description ?? undefined}
          action={empty.action}
        />
      </div>
    );
  } else {
    body = (
      <div className="relative min-h-0 flex-1">
        {hasStaleRows ? <StaleDataNotice onRetry={onRetry} isRetrying={isFetching} className={STALE_NOTICE_CORNER_CLASS} /> : null}
        <ul className="custom-scrollbar h-full overflow-y-auto overscroll-contain">
          {flags.map((flag) => (
            <FlagRow key={flag.id} flag={flag} isSelected={flag.id === selectedFlagId} ctx={ctx} onSelect={onSelect} />
          ))}
        </ul>
      </div>
    );
  }

  return (
    <section
      aria-label={t("observationFlags.list.label")}
      className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card", className)}
    >
      <div className="flex min-h-[41px] shrink-0 items-center justify-between gap-2 border-b bg-muted/40 py-1.5 pr-2 pl-4">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="text-sm font-semibold whitespace-nowrap">{t(`observationFlags.statuses.${status}`)}</h2>
          {view === "loading" || total === null ? (
            <Skeleton className="h-2.5 w-6" aria-hidden="true" />
          ) : (
            <span className="text-xs text-muted-foreground tabular-nums">{total.toLocaleString(i18n.language)}</span>
          )}
        </div>
        <Select
          value={sort}
          onValueChange={(value) => {
            if (isQueueSort(value)) onSortChange(value);
          }}
        >
          <SelectTrigger size="sm" aria-label={t("observationFlags.sort.label")} className="cursor-pointer">
            <SelectValue>{sortLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent align="end">
            {QUEUE_SORTS.map((option) => (
              <SelectItem key={option} value={option}>
                {t(`observationFlags.sort.${SORT_KEYS[option]}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {body}
      {view === "rows" ? (
        <div className="flex shrink-0 items-center justify-between gap-4 border-t py-2 pr-2 pl-4">
          <span aria-live="polite" className="text-sm text-muted-foreground tabular-nums">
            {t("common:pagination.showing", {
              shown: flags.length.toLocaleString(i18n.language),
              total: (total ?? flags.length).toLocaleString(i18n.language),
            })}
          </span>
          {hasMore ? (
            <Button type="button" variant="outline" size="sm" className="cursor-pointer" disabled={isFetchingMore} onClick={onShowMore}>
              {isFetchingMore ? <Spinner data-icon="inline-start" /> : null}
              {t("common:actions.showMore")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
