import { Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { getDeletedEntryAriaLabel } from "../labels";
import type { DeletedEntriesSort, DeletedEntry } from "../types";
import { DeletedEntryIdentifier } from "./deletedEntryIdentifier";
import { UKESourceBadge } from "@/components/cellular/ukeSourceBadge";
import { Button } from "@/components/ui/button";
import type { DataTableViewState } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { formatFullDate } from "@/lib/format";

export const DELETED_ENTRY_MOBILE_ROW_HEIGHT = 65;

export type DeletedEntriesEmptyState = {
  icon: IconSvgElement;
  title: string;
  description: string;
  action?: ReactNode;
};

const SORT_ASC_STYLE = { transform: "scaleY(-1)" };
const MOBILE_SKELETON_ROWS = Array.from({ length: 12 }, (_, index) => (
  <div key={index} className="flex h-16 flex-col justify-center gap-1.5 px-3">
    <div className="flex items-center justify-between gap-3">
      <div className="h-5 w-20 animate-pulse rounded bg-muted" />
      <div className="h-3.5 w-32 animate-pulse rounded bg-muted" />
    </div>
    <div className="h-4 w-40 animate-pulse rounded bg-muted" />
  </div>
));

type DeletedEntryMobileRowProps = {
  entry: DeletedEntry;
  locale: string;
  onOpenEntry: (entry: DeletedEntry) => void;
};

function DeletedEntryMobileRow({ entry, locale, onOpenEntry }: DeletedEntryMobileRowProps) {
  const { t } = useTranslation(["deletedEntries", "stationDetails"]);

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpenEntry(entry)}
        aria-label={getDeletedEntryAriaLabel(t, entry, locale)}
        className="flex h-16 w-full min-w-0 flex-col justify-center gap-1.5 px-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex w-full min-w-0 items-center justify-between gap-3">
          <UKESourceBadge source={entry.source_type} />
          <time dateTime={entry.deleted_at} className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {formatFullDate(entry.deleted_at, locale)}
          </time>
        </span>
        <DeletedEntryIdentifier entry={entry} inline className="w-full" />
      </button>
    </li>
  );
}

type DeletedEntriesMobileListProps = {
  entries: DeletedEntry[];
  viewState: DataTableViewState;
  isRetrying: boolean;
  pageSize: number;
  autoPageSize: number;
  sort: DeletedEntriesSort;
  locale: string;
  emptyState: DeletedEntriesEmptyState;
  onSortToggle: () => void;
  onOpenEntry: (entry: DeletedEntry) => void;
  onRetry: () => unknown;
};

export function DeletedEntriesMobileList({
  entries,
  viewState,
  isRetrying,
  pageSize,
  autoPageSize,
  sort,
  locale,
  emptyState,
  onSortToggle,
  onOpenEntry,
  onRetry,
}: DeletedEntriesMobileListProps) {
  const { t } = useTranslation(["deletedEntries", "common"]);
  const sortLabel = t("deletedEntries.columns.deletedAt");
  const sortDirection = sort === "asc" ? t("common:sorting.ascending") : t("common:sorting.descending");
  const fillStyle = { minHeight: autoPageSize * DELETED_ENTRY_MOBILE_ROW_HEIGHT };

  return (
    <div className="overflow-hidden rounded-t-lg border border-b-0 bg-card">
      <div className="flex h-10 items-center border-b bg-muted/20 px-2">
        <Button type="button" variant="ghost" size="sm" onClick={onSortToggle} aria-label={`${sortLabel}: ${sortDirection}`}>
          {sortLabel}
          <HugeiconsIcon icon={Sorting05Icon} aria-hidden="true" data-icon="inline-end" style={sort === "asc" ? SORT_ASC_STYLE : undefined} />
        </Button>
      </div>
      {viewState === "loading" ? (
        <div className="divide-y" aria-hidden="true">
          {MOBILE_SKELETON_ROWS.slice(0, pageSize)}
        </div>
      ) : null}
      {viewState === "error" ? (
        <div className="flex flex-col p-3" style={fillStyle}>
          <ErrorState className="flex-1" onRetry={onRetry} isRetrying={isRetrying} />
        </div>
      ) : null}
      {viewState === "empty" ? (
        <div role="status" className="flex flex-col p-3" style={fillStyle}>
          <ErrorState tone="neutral" className="flex-1" {...emptyState} />
        </div>
      ) : null}
      {viewState === "ready" ? (
        <ul className="divide-y">
          {entries.map((entry) => (
            <DeletedEntryMobileRow key={entry.id} entry={entry} locale={locale} onOpenEntry={onOpenEntry} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
