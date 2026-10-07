import { MessageMultiple01Icon } from "@hugeicons/core-free-icons";
import type { Comment } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { PENDING_COMMENTS_QUERY } from "../queries";
import {
  CARD_FOOTER_LINK_CLASS,
  CardFooter,
  CardFooterLinkIcon,
  CardLoadError,
  CardLoading,
  CardNotice,
  CardStaleNotice,
  DashboardCard,
  type DashboardLayout,
  type QueueSwitch,
  SystemSettingsLink,
  getCardView,
  hasStaleRows,
  limitRows,
} from "./dashboardCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ApproveCommentButton } from "@/features/admin/comments/components/approveCommentButton";
import { CommentBlock } from "@/features/admin/comments/components/commentBlock";
import { CommentStationLine } from "@/features/admin/comments/components/commentStationLine";
import { DeleteCommentButton } from "@/features/admin/comments/components/deleteCommentButton";
import { DeleteCommentDialog } from "@/features/admin/comments/components/deleteCommentDialog";
import { type PendingCommentWrite, commentRowProps, isCommentWritePending, useCommentModeration } from "@/features/admin/comments/mutations";
import { moderatedCommentsQueryOptions } from "@/features/admin/comments/queries";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { type MapLookups, getOperatorLook } from "@/features/map/data/mapLookups";

type CommentsCardProps = {
  layout: DashboardLayout;
  queueSwitch: QueueSwitch;
  isAdmin: boolean;
  lookups: MapLookups | undefined;
  className?: string;
};

type CommentQueueRowProps = {
  comment: Comment;
  pendingWrite: PendingCommentWrite | null;
  lookups: MapLookups | undefined;
  onApprove: (comment: Comment) => void;
  onDeleteRequest: (comment: Comment) => void;
  onStationOpen: (stationId: number) => void;
};

const STACK_ROW_LIMIT = 3;
const CLAMP_LINES = 6;
const SKELETON_ROW_COUNT = 3;
const NO_COMMENTS: Comment[] = [];

function CommentQueueRow({ comment, pendingWrite, lookups, onApprove, onDeleteRequest, onStationOpen }: CommentQueueRowProps) {
  const { station } = comment;
  const isLocked = pendingWrite !== null;

  return (
    <li {...commentRowProps(comment)}>
      <CommentBlock
        comment={comment}
        className="p-4"
        clampLines={CLAMP_LINES}
        station={
          station === undefined ? null : (
            <CommentStationLine
              station={station}
              brand={getOperatorLook(lookups, station.operatorId).brand}
              onStationOpen={() => onStationOpen(station.id)}
            />
          )
        }
        headActions={
          <DeleteCommentButton
            onDelete={() => onDeleteRequest(comment)}
            isBusy={isCommentWritePending(pendingWrite, comment, "delete")}
            disabled={isLocked}
          />
        }
        actions={
          <ApproveCommentButton
            onApprove={() => onApprove(comment)}
            isBusy={isCommentWritePending(pendingWrite, comment, "approve")}
            disabled={isLocked}
          />
        }
      />
    </li>
  );
}

function CommentRowSkeleton() {
  return (
    <div className="flex gap-3 p-4" aria-hidden="true">
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className="h-3.5 w-44" />
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-[70%]" />
      </div>
    </div>
  );
}

export function CommentsCard({ layout, queueSwitch, isAdmin, lookups, className }: CommentsCardProps) {
  const { t } = useTranslation(["admin", "nav"]);
  const { openStationDialog } = useFloatingDialogStack();
  const { pendingWrite, approve, remove } = useCommentModeration();
  const [commentToDelete, setCommentToDelete] = useState<Comment | null>(null);
  const query = useQuery({ ...moderatedCommentsQueryOptions(PENDING_COMMENTS_QUERY), enabled: queueSwitch === "on" });
  const comments = query.data?.comments ?? NO_COMMENTS;
  const total = query.data?.total ?? 0;
  const isRefilling = comments.length === 0 && total > 0 && query.isFetching;
  const loadedView = isRefilling ? "loading" : getCardView(query, comments.length);
  const view = queueSwitch === "off" ? "off" : loadedView;
  const shownComments = limitRows(comments, layout, STACK_ROW_LIMIT);
  const isListed = view === "ready" || view === "empty";

  return (
    <>
      <DashboardCard
        title={t("nav:items.comments")}
        isFilling={layout === "columns"}
        count={isListed ? total : undefined}
        isBusy={view === "loading"}
        className={className}
        notice={view === "ready" && hasStaleRows(query) ? <CardStaleNotice onRetry={query.refetch} isRetrying={query.isFetching} /> : null}
        footer={
          view === "ready" ? (
            <CardFooter shown={shownComments.length} total={total}>
              <Link to="/admin/comments" className={CARD_FOOTER_LINK_CLASS}>
                {t("dashboard.allComments")}
                <CardFooterLinkIcon />
              </Link>
            </CardFooter>
          ) : null
        }
      >
        {view === "off" ? <CardNotice title={t("dashboard.commentQueueOff")} action={isAdmin ? <SystemSettingsLink /> : undefined} /> : null}
        {view === "loading" ? (
          <CardLoading className="divide-y">
            {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
              <CommentRowSkeleton key={index} />
            ))}
          </CardLoading>
        ) : null}
        {view === "failed" ? <CardLoadError onRetry={query.refetch} isRetrying={query.isFetching} /> : null}
        {view === "empty" ? <CardNotice icon={MessageMultiple01Icon} title={t("dashboard.noCommentsToModerate")} /> : null}
        {view === "ready" ? (
          <ul className="divide-y">
            {shownComments.map((comment) => (
              <CommentQueueRow
                key={comment.id}
                comment={comment}
                pendingWrite={pendingWrite}
                lookups={lookups}
                onApprove={approve}
                onDeleteRequest={setCommentToDelete}
                onStationOpen={(stationId) => openStationDialog(stationId, "internal")}
              />
            ))}
          </ul>
        ) : null}
      </DashboardCard>

      <DeleteCommentDialog comment={commentToDelete} onConfirm={remove} onClose={() => setCommentToDelete(null)} />
    </>
  );
}
