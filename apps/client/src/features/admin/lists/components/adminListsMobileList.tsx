import type { List } from "@openbts/shared/contract";
import { Link } from "@tanstack/react-router";

import { AdminListRowMenu } from "./adminListRowMenu";
import { ListCounts, ListOwnerLine, ListVisibilityBadge } from "./adminListsCells";
import type { DataTableViewState } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { type RecordListEmptyState, RecordListMobileList } from "@/features/admin/reference/components/shared/recordListPrimitives";
import { CreatedDate } from "@/features/admin/reference/components/shared/values";
import { cn } from "@/lib/utils";

type AdminListsMobileListProps = {
  lists: List[];
  viewState: DataTableViewState;
  pageSize: number;
  fillHeight: number;
  emptyState: RecordListEmptyState;
  isRetrying: boolean;
  listRef: (node: HTMLUListElement | null) => void;
  onRetry: () => unknown;
};

const MAX_SKELETON_ROWS = 8;
const CARD_LINK_CLASS = cn(
  "block truncate text-sm font-medium outline-none after:absolute after:inset-0",
  "focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset",
);

function ListMobileCardSkeleton() {
  return (
    <div className="space-y-2 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-48" />
        </div>
        <Skeleton className="h-5 w-20 shrink-0 rounded-4xl" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="size-5 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

function ListMobileCard({ list }: { list: List }) {
  return (
    <div className="relative px-3 py-2.5 transition-colors hover:bg-muted/50 has-data-popup-open:bg-muted/50">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link to="/lists/$uuid" params={{ uuid: list.id }} className={CARD_LINK_CLASS}>
            {list.name}
          </Link>
          {list.description ? <div className="truncate text-xs text-muted-foreground">{list.description}</div> : null}
        </div>
        <span className="inline-flex h-7 shrink-0 items-center">
          <ListVisibilityBadge isPublic={list.isPublic} />
        </span>
        <AdminListRowMenu list={list} className="relative z-10 shrink-0" />
      </div>
      <ListOwnerLine owner={list.owner} isLinked className="mt-2" />
      <div className="mt-2 flex min-h-5 items-center justify-between gap-3">
        <ListCounts list={list} />
        <CreatedDate createdAt={list.createdAt} className="shrink-0" />
      </div>
    </div>
  );
}

export function AdminListsMobileList({
  lists,
  viewState,
  pageSize,
  fillHeight,
  emptyState,
  isRetrying,
  listRef,
  onRetry,
}: AdminListsMobileListProps) {
  return (
    <div className="overflow-hidden rounded-t-lg border border-b-0 bg-card">
      <RecordListMobileList
        viewState={viewState}
        emptyState={emptyState}
        isRetrying={isRetrying}
        onRetry={onRetry}
        skeletonRow={<ListMobileCardSkeleton />}
        skeletonRowCount={Math.min(pageSize, MAX_SKELETON_ROWS)}
        stateMinHeight={fillHeight}
        listRef={listRef}
      >
        {lists.map((list) => (
          <li key={list.id}>
            <ListMobileCard list={list} />
          </li>
        ))}
      </RecordListMobileList>
    </div>
  );
}
