import { Sorting05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Comment } from "@openbts/shared/contract";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { useCommentAuthorName } from "../commentAuthor";
import { ApproveCommentButton } from "../components/approveCommentButton";
import { CommentBlock } from "../components/commentBlock";
import { CommentStationLine } from "../components/commentStationLine";
import { CommentStatusBadge } from "../components/commentStatusBadge";
import { commentRowProps, isCommentWritePending } from "../mutations";
import { useAdminCommentActions } from "./adminCommentActions";
import { CommentCardMenu } from "./adminCommentsCells";
import type { DataTableViewState } from "@/components/ui/data-table";
import { SORT_ASCENDING_ICON_STYLE } from "@/components/ui/data-table-sort-button";
import { Skeleton } from "@/components/ui/skeleton";
import { type RecordListEmptyState, RecordListMobileList } from "@/features/admin/reference/components/shared/recordListPrimitives";
import { getOperatorLook } from "@/features/map/data/mapLookups";
import { isInteractiveTarget } from "@/lib/dom/keyboard";
import { cn } from "@/lib/utils";

type AdminCommentsMobileListProps = {
  comments: Comment[];
  viewState: DataTableViewState;
  emptyState: RecordListEmptyState;
  isRetrying: boolean;
  onRetry: () => unknown;
};

const SKELETON_CARD_COUNT = 6;
const STATE_MIN_HEIGHT = "20rem";
const SORT_BUTTON_CLASS = cn(
  "inline-flex h-8 cursor-pointer items-center gap-1 rounded-md bg-muted px-2 text-xs font-medium text-foreground transition-colors",
  "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
);
const CARD_OPEN_CLASS = cn(
  "pointer-events-none absolute inset-1 z-20 rounded-md opacity-0 outline-none",
  "focus:pointer-events-auto focus:opacity-100 focus:ring-2 focus:ring-ring",
);

function CommentMobileCardSkeleton() {
  return (
    <div className="flex gap-3 px-3 py-2.5">
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-5 w-20 shrink-0 rounded-4xl" />
        </div>
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

function CommentMobileCard({ comment }: { comment: Comment }) {
  const { t } = useTranslation("admin");
  const { lookups, pendingWrite, onOpen, onApprove } = useAdminCommentActions();
  const authorName = useCommentAuthorName(comment.author);
  const { station } = comment;
  const { operator, brand } = getOperatorLook(lookups, station?.operatorId);

  function openFromCard(event: MouseEvent<HTMLDivElement>) {
    const { target, currentTarget } = event;
    if (!(target instanceof Node) || !currentTarget.contains(target) || isInteractiveTarget(target, currentTarget)) return;
    onOpen(comment);
  }

  return (
    <div
      {...commentRowProps(comment)}
      className="relative cursor-pointer transition-colors hover:bg-muted/50 has-data-popup-open:bg-muted/50"
      onClick={openFromCard}
    >
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={`${t("admin:comments.sheet.title")}: ${authorName}`}
        className={CARD_OPEN_CLASS}
        onClick={() => onOpen(comment)}
      />
      <CommentBlock
        comment={comment}
        className="px-3 py-2.5"
        clampLines={4}
        canExpand={false}
        thumbnailSize="sm"
        station={station === undefined ? null : <CommentStationLine station={station} brand={brand} operatorName={operator?.name} />}
        headActions={
          <>
            <CommentStatusBadge status={comment.status} />
            <CommentCardMenu comment={comment} />
          </>
        }
        actions={
          comment.status === "pending" ? (
            <ApproveCommentButton
              onApprove={() => onApprove(comment)}
              isBusy={isCommentWritePending(pendingWrite, comment, "approve")}
              disabled={pendingWrite !== null}
            />
          ) : null
        }
      />
    </div>
  );
}

function CommentsSortBar() {
  const { t } = useTranslation(["common", "submissions"]);
  const { sort, onSortChange } = useAdminCommentActions();
  const isAscending = sort === "createdAt";
  const createdLabel = t("common:labels.created");

  return (
    <div className="flex h-10 items-center gap-1 border-b bg-muted/20 px-2">
      <button
        type="button"
        className={SORT_BUTTON_CLASS}
        aria-label={`${createdLabel}: ${isAscending ? t("submissions:table.sortAscending") : t("submissions:table.sortDescending")}`}
        onClick={() => onSortChange(isAscending ? "-createdAt" : "createdAt")}
      >
        {createdLabel}
        <HugeiconsIcon icon={Sorting05Icon} aria-hidden="true" className="size-3.5" style={isAscending ? SORT_ASCENDING_ICON_STYLE : undefined} />
      </button>
    </div>
  );
}

export function AdminCommentsMobileList({ comments, viewState, emptyState, isRetrying, onRetry }: AdminCommentsMobileListProps) {
  return (
    <div className="overflow-hidden rounded-t-lg border border-b-0 bg-card">
      <CommentsSortBar />
      <RecordListMobileList
        viewState={viewState}
        emptyState={emptyState}
        isRetrying={isRetrying}
        onRetry={onRetry}
        skeletonRow={<CommentMobileCardSkeleton />}
        skeletonRowCount={SKELETON_CARD_COUNT}
        stateMinHeight={STATE_MIN_HEIGHT}
      >
        {comments.map((comment) => (
          <li key={comment.id}>
            <CommentMobileCard comment={comment} />
          </li>
        ))}
      </RecordListMobileList>
    </div>
  );
}
