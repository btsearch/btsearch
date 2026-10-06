import type { Comment } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { approveComment, sendCommentBackToQueue, updateCommentText } from "./api";
import { invalidateCommentQueries, storeChangedComment, storeDeletedComment } from "./queries";
import { deleteStationComment } from "@/features/station-details/station/comments/api";
import { ApiResponseError, showApiError } from "@/lib/api";

type CommentWriteKind = "approve" | "sendBack" | "edit" | "delete";

export type PendingCommentWrite = {
  commentId: string;
  kind: CommentWriteKind;
};

type CommentChangeOptions = {
  onSuccess?: (changed: Comment) => void;
};

type CommentDeleteOptions = {
  onSuccess?: () => void;
};

type CommentTextEdit = {
  comment: Comment;
  content: string;
};

const COMMENT_ROW_ATTRIBUTE = "data-comment-row";
const COMMENT_ROW_SELECTOR = `[${COMMENT_ROW_ATTRIBUTE}]`;
const ROW_CONTROL_SELECTOR = "a[href], button, [tabindex]:not([tabindex='-1'])";

export function commentRowProps(comment: Comment) {
  return { [COMMENT_ROW_ATTRIBUTE]: comment.id };
}

export function isRepeatedClick(event: { detail: number }): boolean {
  return event.detail > 1;
}

function swallowRepeatedClick(event: MouseEvent) {
  if (isRepeatedClick(event)) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  document.removeEventListener("click", swallowRepeatedClick, true);
}

function swallowRestOfClickSeries() {
  document.addEventListener("click", swallowRepeatedClick, true);
}

export function isCommentWritePending(pendingWrite: PendingCommentWrite | null, comment: Comment, kind: CommentWriteKind): boolean {
  return pendingWrite !== null && pendingWrite.commentId === comment.id && pendingWrite.kind === kind;
}

function toPendingWrite(kind: CommentWriteKind, isPending: boolean, comment: Comment | undefined): PendingCommentWrite | null {
  return isPending && comment !== undefined ? { commentId: comment.id, kind } : null;
}

function moveFocusToNextCommentRow(commentId: string) {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement) || !focused.matches(":focus-visible")) return;

  const ownMark = focused.closest(COMMENT_ROW_SELECTOR);
  if (ownMark === null || ownMark.getAttribute(COMMENT_ROW_ATTRIBUTE) !== commentId) return;

  const marks = [...document.querySelectorAll(COMMENT_ROW_SELECTOR)];
  const position = marks.indexOf(ownMark);
  const nextMark = marks[position + 1] ?? marks[position - 1] ?? ownMark;
  const nextRow = nextMark.closest("tr") ?? nextMark;
  nextRow.querySelector<HTMLElement>(ROW_CONTROL_SELECTOR)?.focus();
}

export function useCommentModeration() {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();

  function storeChange(changed: Comment, doneText: string) {
    storeChangedComment(queryClient, changed);
    invalidateCommentQueries(queryClient, changed);
    toast.success(doneText);
  }

  function storeStatusChange(changed: Comment, doneText: string) {
    moveFocusToNextCommentRow(changed.id);
    storeChange(changed, doneText);
  }

  function reportFailedWrite(error: unknown, comment: Comment) {
    showApiError(error);
    if (error instanceof ApiResponseError) invalidateCommentQueries(queryClient, comment);
  }

  const approveMutation = useMutation({
    mutationFn: (comment: Comment) => approveComment(comment.id),
    onSuccess: (approved) => storeStatusChange(approved, t("comments.approveSuccess")),
    onError: reportFailedWrite,
  });

  const sendBackMutation = useMutation({
    mutationFn: (comment: Comment) => sendCommentBackToQueue(comment.id),
    onSuccess: (returned) => storeStatusChange(returned, t("comments.sendBackSuccess")),
    onError: reportFailedWrite,
  });

  const editMutation = useMutation({
    mutationFn: ({ comment, content }: CommentTextEdit) => updateCommentText(comment.id, content),
    onSuccess: (edited) => storeChange(edited, t("comments.editSuccess")),
    onError: (error, { comment }) => reportFailedWrite(error, comment),
  });

  const deleteMutation = useMutation({
    mutationFn: (comment: Comment) => deleteStationComment(comment.id),
    onSuccess: (_, deleted) => {
      moveFocusToNextCommentRow(deleted.id);
      storeDeletedComment(queryClient, deleted);
      invalidateCommentQueries(queryClient, deleted);
      toast.success(t("comments.deleteSuccess"));
    },
    onError: reportFailedWrite,
  });

  const { mutate: requestApproval } = approveMutation;
  const { mutate: requestReturn } = sendBackMutation;
  const { mutate: requestTextEdit } = editMutation;
  const { mutate: requestDeletion } = deleteMutation;

  function approve(comment: Comment, options?: CommentChangeOptions) {
    swallowRestOfClickSeries();
    requestApproval(comment, options);
  }

  function sendBack(comment: Comment, options?: CommentChangeOptions) {
    swallowRestOfClickSeries();
    requestReturn(comment, options);
  }

  function edit(comment: Comment, content: string, options?: CommentChangeOptions) {
    swallowRestOfClickSeries();
    requestTextEdit({ comment, content }, options);
  }

  function remove(comment: Comment, options?: CommentDeleteOptions) {
    swallowRestOfClickSeries();
    requestDeletion(comment, options);
  }

  const pendingWrite =
    toPendingWrite("approve", approveMutation.isPending, approveMutation.variables) ??
    toPendingWrite("sendBack", sendBackMutation.isPending, sendBackMutation.variables) ??
    toPendingWrite("edit", editMutation.isPending, editMutation.variables?.comment) ??
    toPendingWrite("delete", deleteMutation.isPending, deleteMutation.variables);

  return { pendingWrite, approve, sendBack, edit, remove };
}
