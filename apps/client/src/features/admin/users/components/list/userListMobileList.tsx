import { Link } from "@tanstack/react-router";

import { getUserStatus } from "../../utils/userStatus";
import { UserStatusBadge } from "../shared/userStatusBadge";
import { UserAccessSummary, UserEmail, UserIdentity } from "./userListCells";
import type { UserListRow } from "./useUserListRows";
import type { DataTableViewState } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { type RecordListEmptyState, RecordListMobileList } from "@/features/admin/reference/components/shared/recordListPrimitives";
import { CreatedDate } from "@/features/admin/reference/components/shared/values";
import { cn } from "@/lib/utils";

type UserListMobileListProps = {
  rows: UserListRow[];
  viewState: DataTableViewState;
  pageSize: number;
  fillHeight: number;
  emptyState: RecordListEmptyState;
  isRetrying: boolean;
  listRef: (node: HTMLUListElement | null) => void;
  onRetry: () => unknown;
};

const MAX_SKELETON_ROWS = 8;
const ROW_LINK_CLASS = cn(
  "block px-3 py-2.5 transition-colors hover:bg-muted/50",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
);

function UserMobileRowSkeleton() {
  return (
    <div className="space-y-2 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-8 shrink-0 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-2/3" />
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-20 rounded-4xl" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}

function UserMobileRow({ row }: { row: UserListRow }) {
  const { account } = row.user;
  const status = getUserStatus(account);

  return (
    <Link to="/admin/users/$id" params={{ id: row.user.id }} className={ROW_LINK_CLASS}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <UserIdentity row={row} />
        {status === "active" ? null : <UserStatusBadge status={status} />}
      </div>
      <div className="mt-2">
        <UserEmail account={account} isCompact />
      </div>
      <div className="mt-2 flex min-h-5 min-w-0 items-center justify-between gap-3 text-xs">
        <UserAccessSummary row={row} />
        <CreatedDate createdAt={account.createdAt} className="shrink-0" />
      </div>
    </Link>
  );
}

export function UserListMobileList({ rows, viewState, pageSize, fillHeight, emptyState, isRetrying, listRef, onRetry }: UserListMobileListProps) {
  return (
    <div className="overflow-hidden rounded-t-lg border border-b-0 bg-card">
      <RecordListMobileList
        viewState={viewState}
        emptyState={emptyState}
        isRetrying={isRetrying}
        onRetry={onRetry}
        skeletonRow={<UserMobileRowSkeleton />}
        skeletonRowCount={Math.min(pageSize, MAX_SKELETON_ROWS)}
        stateMinHeight={fillHeight}
        listRef={listRef}
      >
        {rows.map((row) => (
          <li key={row.user.id}>
            <UserMobileRow row={row} />
          </li>
        ))}
      </RecordListMobileList>
    </div>
  );
}
