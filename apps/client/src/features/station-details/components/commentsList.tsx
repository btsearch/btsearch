import { AlertCircleIcon, Delete02Icon, Image01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { AddCommentForm } from "./addCommentForm";
import { Lightbox, type LightboxPhoto } from "@/components/photos/lightbox";
import { PhotoWithFallback } from "@/components/photos/photoGridPrimitives";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { API_BASE, fetchApiData, showApiError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { resolveAvatarUrl } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CommentAttachment, StationComment } from "@/types/station";

const fetchComments = (stationId: number) =>
  fetchApiData<StationComment[]>(`stations/${stationId}/comments`, {
    allowedErrors: [404, 403],
  }).then((data) => data ?? []);

const photoIndex = (attachments: CommentAttachment[], attachmentIndex: number) =>
  attachments.slice(0, attachmentIndex).filter((attachment) => attachment.type.startsWith("image/")).length;

type CommentsListProps = {
  stationId: number;
  isAdmin?: boolean;
};

export function CommentsList({ stationId, isAdmin = false }: CommentsListProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const { data: session } = authClient.useSession();
  const currentUserId = session?.user?.id;
  const isLoggedIn = !!session?.user;
  const queryClient = useQueryClient();
  const {
    data: comments = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["station-comments", stationId, currentUserId],
    queryFn: () => fetchComments(stationId),
    enabled: !!stationId,
    staleTime: 1000 * 60 * 5,
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const response = await fetch(`${API_BASE}/stations/${stationId}/comments/${commentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) throw new Error("Failed to delete comment");
    },
    onSuccess: (_data, commentId) => {
      const wasPending = comments.some((comment) => comment.id === commentId && comment.status === "pending");
      toast.success(t(wasPending ? "comments.withdrawn" : "comments.deleted"));
      return queryClient.invalidateQueries({ queryKey: ["station-comments", stationId] });
    },
    onError: (error) => showApiError(error),
  });

  const [lightbox, setLightbox] = useState<{ commentId: string; index: number } | null>(null);

  const lightboxComment = useMemo(() => (lightbox ? comments.find((c) => c.id === lightbox.commentId) : null), [lightbox, comments]);
  const lightboxPhotos: LightboxPhoto[] = useMemo(
    () =>
      lightboxComment
        ? (lightboxComment.attachments
            ?.filter((a) => a.type.startsWith("image/"))
            .map((a) => ({
              attachment_uuid: a.uuid,
              note: null,
              createdAt: lightboxComment.createdAt,
              author: lightboxComment.author
                ? {
                    uuid: lightboxComment.author.id,
                    username: lightboxComment.author.username ?? "",
                    name: lightboxComment.author.name,
                  }
                : null,
            })) ?? [])
        : [],
    [lightboxComment],
  );

  const closeLightbox = useCallback(() => setLightbox(null), []);
  const prevPhoto = useCallback(
    () => setLightbox((prev) => (prev ? { ...prev, index: (prev.index - 1 + lightboxPhotos.length) % lightboxPhotos.length } : null)),
    [lightboxPhotos.length],
  );
  const nextPhoto = useCallback(
    () => setLightbox((prev) => (prev ? { ...prev, index: (prev.index + 1) % lightboxPhotos.length } : null)),
    [lightboxPhotos.length],
  );

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

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
        <HugeiconsIcon icon={AlertCircleIcon} className="size-4 shrink-0" />
        <p>{t("comments.unavailable")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {comments.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm font-medium text-foreground">{t("comments.noComments")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("comments.noCommentsHint")}</p>
        </div>
      ) : (
        <div className="divide-y divide-border/60">
          {comments.map((comment) => (
            <article key={comment.id} className="flex min-w-0 gap-3 py-4 first:pt-0 last:pb-0">
              <Avatar className="size-8 shrink-0 border">
                <AvatarImage src={resolveAvatarUrl(comment.author?.image)} alt="" />
                <AvatarFallback className="text-xs font-semibold text-muted-foreground">
                  {comment.author?.name ? (
                    comment.author.name.charAt(0).toLocaleUpperCase(i18n.language)
                  ) : (
                    <HugeiconsIcon icon={UserIcon} className="size-4" />
                  )}
                </AvatarFallback>
              </Avatar>

              <div className={cn("relative min-w-0 flex-1", (isAdmin || comment.user_id === currentUserId) && "pr-9")}>
                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  {comment.author?.username ? (
                    <Link
                      to="/users/$username"
                      params={{ username: comment.author.username }}
                      className="max-w-full truncate text-sm font-semibold text-foreground underline-offset-2 hover:underline"
                    >
                      {comment.author.name}
                    </Link>
                  ) : (
                    <span className="truncate text-sm font-semibold text-foreground">{comment.author?.name ?? t("comments.unknownAuthor")}</span>
                  )}
                  {comment.author?.username && <span className="truncate text-xs text-muted-foreground">@{comment.author.username}</span>}
                  <time
                    dateTime={comment.createdAt}
                    title={new Date(comment.createdAt).toLocaleString(i18n.language)}
                    className="text-xs tabular-nums text-muted-foreground"
                  >
                    {new Date(comment.createdAt).toLocaleDateString(i18n.language)}
                  </time>
                </div>
                {(isAdmin || comment.user_id === currentUserId) && (
                  <div className="absolute -right-1 -top-1">
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon"
                            className="cursor-pointer text-muted-foreground hover:text-destructive"
                            aria-label={comment.status === "pending" ? t("comments.withdraw") : t("comments.deleteConfirm")}
                            title={comment.status === "pending" ? t("comments.withdraw") : t("comments.deleteConfirm")}
                            disabled={deleteMutation.isPending}
                          />
                        }
                      >
                        <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{comment.status === "pending" ? t("comments.withdraw") : t("comments.deleteConfirm")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {comment.status === "pending" ? t("comments.withdrawDescription") : t("comments.deleteDescription")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" className="cursor-pointer" onClick={() => deleteMutation.mutate(comment.id)}>
                            {comment.status === "pending" ? t("comments.withdraw") : t("common:actions.delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
                <p className="mt-1.5 max-w-prose whitespace-pre-wrap break-words text-sm leading-6 text-foreground">{comment.content}</p>

                {comment.attachments && comment.attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {comment.attachments.map((attachment, attachmentIndex) =>
                      attachment.type.startsWith("image/") ? (
                        <button
                          type="button"
                          key={attachment.uuid}
                          onClick={() => setLightbox({ commentId: comment.id, index: photoIndex(comment.attachments ?? [], attachmentIndex) })}
                          aria-label={t("photos.openPhoto", { number: photoIndex(comment.attachments ?? [], attachmentIndex) + 1 })}
                          className="overflow-hidden rounded-lg border bg-muted/20 transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <PhotoWithFallback
                            src={`/uploads/${attachment.uuid}.webp`}
                            alt=""
                            className="size-20 object-cover sm:size-24"
                            fallbackClassName="gap-1 px-1 text-[9px] leading-tight [&_svg]:size-4"
                          />
                        </button>
                      ) : (
                        <div
                          key={attachment.uuid}
                          className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border bg-muted/20 text-muted-foreground sm:size-24"
                        >
                          <HugeiconsIcon icon={Image01Icon} className="size-6" />
                          <span className="text-[10px]">{t("comments.file")}</span>
                        </div>
                      ),
                    )}
                  </div>
                )}
                {comment.status === "pending" && (
                  <p className="mt-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">{t("comments.pendingStatus")}</p>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {isLoggedIn && (
        <div className={comments.length > 0 ? "border-t border-border/60 pt-5" : undefined}>
          <AddCommentForm stationId={stationId} />
        </div>
      )}
      <Lightbox photos={lightboxPhotos} index={lightbox?.index ?? null} onClose={closeLightbox} onPrev={prevPhoto} onNext={nextPhoto} />
    </div>
  );
}
