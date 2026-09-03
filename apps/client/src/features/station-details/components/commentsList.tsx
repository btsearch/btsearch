import { AlertCircleIcon, Calendar03Icon, Delete02Icon, Image01Icon, Message01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Lightbox, type LightboxPhoto } from "@/components/lightbox";
import { PhotoWithFallback } from "@/components/photoGridPrimitives";
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
import { Spinner } from "@/components/ui/spinner";
import { API_BASE, fetchApiData, showApiError } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { resolveAvatarUrl } from "@/lib/format";
import type { StationComment } from "@/types/station";

import { AddCommentForm } from "./addCommentForm";

const fetchComments = (stationId: number) =>
  fetchApiData<StationComment[]>(`stations/${stationId}/comments`, {
    allowedErrors: [404, 403],
  }).then((data) => data ?? []);

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
    queryKey: ["station-comments", stationId],
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
    onSuccess: () => {
      toast.success(t("stationDetails:comments.deleted"));
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
      <div className="flex items-center justify-center py-10">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground px-4">
        <div className="size-10 rounded-full bg-destructive/5 flex items-center justify-center text-destructive/50 mb-3">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
        </div>
        <p className="text-sm">{t("comments.unavailable")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground bg-muted/10 rounded-2xl border border-dashed mx-2">
          <HugeiconsIcon icon={Message01Icon} className="size-10 mb-3 opacity-10" />
          <p className="text-sm font-medium text-foreground">{t("comments.noComments")}</p>
          <p className="text-xs text-muted-foreground mt-1 px-6">{t("comments.noCommentsHint")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {comments.map((comment) => (
            <div key={comment.id} className="flex gap-4">
              <Avatar className="size-9 shrink-0 border">
                <AvatarImage src={resolveAvatarUrl(comment.author?.image)} />
                <AvatarFallback>
                  <HugeiconsIcon icon={UserIcon} className="size-4 opacity-50" />
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {comment.author?.username ? (
                      <Link
                        to="/users/$username"
                        params={{ username: comment.author.username }}
                        className="text-sm font-bold truncate hover:underline"
                      >
                        {comment.author.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-bold truncate">{comment.author?.name}</span>
                    )}
                    {comment.author?.username && <span className="text-xs text-muted-foreground truncate">@{comment.author.username}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <HugeiconsIcon icon={Calendar03Icon} className="size-3" />
                      {new Date(comment.createdAt).toLocaleDateString(i18n.language)}
                    </span>
                    {(isAdmin || comment.author?.id === currentUserId) && (
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-6 p-0 text-muted-foreground hover:text-destructive"
                              disabled={deleteMutation.isPending}
                            />
                          }
                        >
                          <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t("stationDetails:comments.deleteConfirm")}</AlertDialogTitle>
                            <AlertDialogDescription>{t("stationDetails:comments.deleteDescription")}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
                            <AlertDialogAction variant="destructive" onClick={() => deleteMutation.mutate(comment.id)}>
                              {t("common:actions.delete")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
                <div className="p-3.5 rounded-2xl rounded-tl-none bg-muted/20 border text-sm leading-relaxed space-y-3">
                  <p>{comment.content}</p>

                  {comment.attachments && comment.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border/50">
                      {comment.attachments.map((attachment, attachmentIndex) =>
                        attachment.type.startsWith("image/") ? (
                          <button
                            type="button"
                            key={attachment.uuid}
                            onClick={() => setLightbox({ commentId: comment.id, index: attachmentIndex })}
                            className="group relative rounded-lg overflow-hidden border bg-muted/20 hover:border-primary/50 transition-colors cursor-pointer"
                          >
                            <PhotoWithFallback
                              src={`/uploads/${attachment.uuid}.webp`}
                              alt="Attachment"
                              className="size-20 object-cover"
                              fallbackClassName="gap-1 px-1 text-[9px] leading-tight [&_svg]:size-4"
                            />
                          </button>
                        ) : (
                          <div
                            key={attachment.uuid}
                            className="size-20 flex flex-col items-center justify-center gap-1 text-muted-foreground rounded-lg border bg-muted/20"
                          >
                            <HugeiconsIcon icon={Image01Icon} className="size-6" />
                            <span className="text-[10px]">{t("comments.file")}</span>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {comments.length > 0 && <div className="border-t" />}
      {isLoggedIn && <AddCommentForm stationId={stationId} />}
      <Lightbox photos={lightboxPhotos} index={lightbox?.index ?? null} onClose={closeLightbox} onPrev={prevPhoto} onNext={nextPhoto} />
    </div>
  );
}
