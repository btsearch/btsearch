import { Message01Icon } from "@hugeicons/core-free-icons";
import type { Comment } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { InlineError } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { ApproveCommentButton } from "@/features/admin/comments/components/approveCommentButton";
import { CommentBlock } from "@/features/admin/comments/components/commentBlock";
import { DeleteCommentButton } from "@/features/admin/comments/components/deleteCommentButton";
import { DeleteCommentDialog } from "@/features/admin/comments/components/deleteCommentDialog";
import { commentRowProps, isCommentWritePending, useCommentModeration } from "@/features/admin/comments/mutations";
import { moderatedStationCommentsQueryOptions } from "@/features/admin/comments/queries";
import { EditCard } from "@/features/station-editing/components/frame/editCard";
import { authClient } from "@/lib/auth/client";

type StationCommentsSectionProps = {
  stationId: number;
};

type CommentRowProps = {
  comment: Comment;
  isLocked: boolean;
  isApproving: boolean;
  onApprove: (comment: Comment) => void;
  onDeleteRequest: (comment: Comment) => void;
};

const NO_COMMENTS: Comment[] = [];

function CommentRow({ comment, isLocked, isApproving, onApprove, onDeleteRequest }: CommentRowProps) {
  const { t } = useTranslation("stationDetails");
  const isAwaitingApproval = comment.status === "pending";

  return (
    <div {...commentRowProps(comment)}>
      <CommentBlock
        comment={comment}
        className="p-4"
        headActions={<DeleteCommentButton onDelete={() => onDeleteRequest(comment)} disabled={isLocked} />}
        status={
          isAwaitingApproval ? <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{t("comments.pendingStatus")}</span> : null
        }
        actions={isAwaitingApproval ? <ApproveCommentButton onApprove={() => onApprove(comment)} isBusy={isApproving} disabled={isLocked} /> : null}
      />
    </div>
  );
}

export function StationCommentsSection({ stationId }: StationCommentsSectionProps) {
  const { t } = useTranslation("common");
  const { data: authSession } = authClient.useSession();
  const {
    data: comments = NO_COMMENTS,
    isLoading,
    isLoadingError,
    isFetching,
    refetch,
  } = useQuery(moderatedStationCommentsQueryOptions(stationId, authSession?.user?.id));
  const { pendingWrite, approve, remove } = useCommentModeration();
  const [commentToDelete, setCommentToDelete] = useState<Comment | null>(null);

  return (
    <>
      <EditCard title={t("labels.comments")} icon={Message01Icon} count={`(${comments.length})`} isCollapsible>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : null}
        {isLoadingError ? <InlineError className="m-4" onRetry={() => refetch()} isRetrying={isFetching} /> : null}
        {!isLoading && !isLoadingError && comments.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">{t("empty.comments")}</div>
        ) : null}
        {comments.length > 0 ? (
          <div className="divide-y max-h-105 overflow-y-auto">
            {comments.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                isLocked={pendingWrite !== null}
                isApproving={isCommentWritePending(pendingWrite, comment, "approve")}
                onApprove={approve}
                onDeleteRequest={setCommentToDelete}
              />
            ))}
          </div>
        ) : null}
      </EditCard>

      <DeleteCommentDialog comment={commentToDelete} onConfirm={remove} onClose={() => setCommentToDelete(null)} />
    </>
  );
}
