import { Delete02Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { COMMENTS_OFF, deleteStationComment, stationCommentKeys, stationCommentsQueryOptions } from "../station/comments/api";
import type { StationComment } from "../station/comments/types";
import { AddCommentForm } from "./addCommentForm";
import { preloadLightbox } from "@/components/lightbox";
import { PhotoWithFallback } from "@/components/photos/photoGridPrimitives";
import { type LightboxPhoto, PhotoLightbox } from "@/components/photos/photoLightbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { UserLink } from "@/features/user-profile/components/userLink";
import { showApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

const NO_COMMENTS: StationComment[] = [];

function getAuthorInitial(author: StationComment["author"], locale: string) {
  const [first] = author.name || author.username || "";
  return first ? first.toLocaleUpperCase(locale) : null;
}

function toLightboxPhotos(comment: StationComment): LightboxPhoto[] {
  return comment.attachments.map((attachment) => ({
    id: attachment.id,
    urls: { thumb: attachment.url, display: attachment.url, full: attachment.url },
    width: null,
    height: null,
    note: null,
    takenAt: null,
    createdAt: comment.createdAt,
    author: comment.author,
  }));
}

type CommentsListProps = {
  stationId: number;
  canModerate?: boolean;
  showAddForm?: boolean;
};

export function CommentsList({ stationId, canModerate = false, showAddForm = false }: CommentsListProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
  const queryClient = useQueryClient();
  const { data, isLoading, isFetching, isLoadingError, isRefetchError, refetch } = useQuery(stationCommentsQueryOptions(stationId, currentUserId));
  const areCommentsOff = data === COMMENTS_OFF;
  const comments = data ?? NO_COMMENTS;

  const deleteMutation = useMutation({
    mutationFn: (comment: StationComment) => deleteStationComment(comment.id),
    onSuccess: (_data, comment) => {
      toast.success(t(comment.status === "pending" ? "comments.withdrawn" : "admin:comments.deleteSuccess"));
      return queryClient.invalidateQueries({ queryKey: stationCommentKeys.station(comment.stationId) });
    },
    onError: (error) => showApiError(error),
  });

  const [lightbox, setLightbox] = useState<{ commentId: string; index: number } | null>(null);
  const [commentToDelete, setCommentToDelete] = useState<StationComment | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const deleteTriggerRef = useRef<HTMLElement | null>(null);

  function requestDelete(comment: StationComment, trigger: HTMLElement): void {
    deleteTriggerRef.current = trigger;
    setCommentToDelete(comment);
    setIsDeleteDialogOpen(true);
  }

  function confirmDelete(): void {
    if (commentToDelete === null || deleteMutation.isPending) return;
    deleteMutation.mutate(commentToDelete);
  }

  if (isLoading) {
    return (
      <div className="divide-y divide-border/60" aria-busy="true">
        {[1, 2].map((row) => (
          <div key={row} className="flex gap-3 py-5 first:pt-0">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full max-w-md" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (isLoadingError) {
    return <ErrorState className="min-h-0 py-8" title={t("comments.unavailable")} onRetry={() => refetch()} isRetrying={isFetching} />;
  }

  const lightboxComment = lightbox === null ? undefined : comments.find((comment) => comment.id === lightbox.commentId);
  const lightboxPhotos = lightboxComment === undefined ? [] : toLightboxPhotos(lightboxComment);
  const isWithdrawal = commentToDelete?.status === "pending";

  return (
    <div className="space-y-5">
      {isRefetchError ? (
        <div className="flex justify-center">
          <StaleDataNotice onRetry={() => refetch()} isRetrying={isFetching} />
        </div>
      ) : null}
      {comments.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm font-medium text-foreground">{t("common:empty.comments")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("comments.noCommentsHint")}</p>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {comments.map((comment) => {
            const canDelete = canModerate || comment.author.id === currentUserId;
            const isAwaitingApproval = comment.status === "pending";
            const deleteLabel = isAwaitingApproval ? t("comments.withdraw") : t("admin:comments.deleteTitle");

            return (
              <article key={comment.id} className="flex min-w-0 gap-3 py-4 first:pt-0 last:pb-0">
                <Avatar className="size-8 shrink-0 border">
                  <AvatarImage src={resolveAvatarUrl(comment.author.image)} alt="" />
                  <AvatarFallback className="text-xs font-semibold text-muted-foreground">
                    {getAuthorInitial(comment.author, i18n.language) ?? <HugeiconsIcon icon={UserIcon} className="size-4" aria-hidden="true" />}
                  </AvatarFallback>
                </Avatar>

                <div className="relative min-w-0 flex-1">
                  <div className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1", canDelete && "pr-9")}>
                    <UserLink user={comment.author} className="max-w-full truncate text-sm font-semibold text-foreground">
                      {comment.author.name || (comment.author.username ? `@${comment.author.username}` : t("comments.unknownAuthor"))}
                    </UserLink>
                    {comment.author.username && comment.author.name ? (
                      <span className="truncate text-xs text-muted-foreground">@{comment.author.username}</span>
                    ) : null}
                    <time
                      dateTime={comment.createdAt}
                      title={new Date(comment.createdAt).toLocaleString(i18n.language)}
                      className="text-xs tabular-nums text-muted-foreground"
                    >
                      {new Date(comment.createdAt).toLocaleDateString(i18n.language)}
                    </time>
                  </div>
                  {canDelete ? (
                    <div className="absolute -right-1 -top-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="cursor-pointer text-muted-foreground hover:text-destructive"
                        aria-label={deleteLabel}
                        aria-haspopup="dialog"
                        aria-expanded={isDeleteDialogOpen && commentToDelete?.id === comment.id}
                        title={deleteLabel}
                        disabled={deleteMutation.isPending}
                        onClick={(event) => requestDelete(comment, event.currentTarget)}
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : null}
                  <p className="mt-1.5 whitespace-pre-wrap wrap-break-word text-sm leading-6 text-foreground">{comment.content}</p>

                  {comment.attachments.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {comment.attachments.map((attachment, attachmentIndex) => (
                        <button
                          type="button"
                          key={attachment.id}
                          onClick={() => setLightbox({ commentId: comment.id, index: attachmentIndex })}
                          onPointerEnter={preloadLightbox}
                          onFocus={preloadLightbox}
                          aria-haspopup="dialog"
                          aria-label={t("photos.openPhoto", { number: attachmentIndex + 1 })}
                          className="cursor-zoom-in overflow-hidden rounded-lg border bg-muted/20 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <PhotoWithFallback
                            src={attachment.url}
                            alt=""
                            className="size-20 object-cover sm:size-24"
                            fallbackClassName="gap-1 px-1 text-[9px] leading-tight [&_svg]:size-4"
                          />
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {isAwaitingApproval ? (
                    <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">{t("comments.pendingStatus")}</p>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {showAddForm && session?.user && !areCommentsOff ? (
        <div className={comments.length > 0 ? "border-t border-border/60 pt-5" : undefined}>
          <AddCommentForm key={`${stationId}:${currentUserId}`} stationId={stationId} />
        </div>
      ) : null}
      <PhotoLightbox photos={lightboxPhotos} index={lightbox?.index ?? null} onClose={() => setLightbox(null)} />
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent finalFocus={deleteTriggerRef}>
          <AlertDialogHeader>
            <AlertDialogTitle>{isWithdrawal ? t("comments.withdraw") : t("admin:comments.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{isWithdrawal ? t("comments.withdrawDescription") : t("comments.deleteDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" className="cursor-pointer" onClick={confirmDelete}>
              {isWithdrawal ? t("comments.withdraw") : t("common:actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
