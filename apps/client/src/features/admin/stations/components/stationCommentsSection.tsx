import { ArrowDown01Icon, Calendar03Icon, Delete02Icon, Image01Icon, Message01Icon, UserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Spinner } from "@/components/ui/spinner";
import { API_BASE, fetchApiData, showApiError } from "@/lib/api";
import { resolveAvatarUrl } from "@/lib/format";
import type { StationComment } from "@/types/station";

type StationCommentsSectionProps = {
  stationId: number;
};

export function StationCommentsSection({ stationId }: StationCommentsSectionProps) {
  const { t, i18n } = useTranslation("submissions");
  const { t: tAdmin } = useTranslation("admin");
  const queryClient = useQueryClient();

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ["station-comments", stationId],
    queryFn: () =>
      fetchApiData<StationComment[]>(`stations/${stationId}/comments`, {
        allowedErrors: [404, 403],
      }).then((data) => data ?? []),
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
      toast.success(tAdmin("comments.deleteSuccess"));
      void queryClient.invalidateQueries({ queryKey: ["station-comments", stationId] });
      setDeleteTarget(null);
    },
    onError: showApiError,
  });

  return (
    <>
      <Collapsible defaultOpen>
        <div className="border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/50 border-b flex items-center justify-between">
            <CollapsibleTrigger className="flex items-center gap-2 cursor-pointer select-none group">
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                className="size-3.5 text-muted-foreground transition-transform group-data-panel-open:rotate-0 -rotate-90"
              />
              <HugeiconsIcon icon={Message01Icon} className="size-4 text-muted-foreground" />
              <span className="font-semibold text-sm">{t("stationComments.title")}</span>
              <span className="text-xs text-muted-foreground">({comments.length})</span>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            ) : comments.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">{t("stationComments.noComments")}</div>
            ) : (
              <div className="divide-y max-h-105 overflow-y-auto">
                {comments.map((comment) => (
                  <div key={comment.id} className="flex gap-3 p-4">
                    <Avatar className="size-8 shrink-0">
                      {comment.author?.image && <AvatarImage src={resolveAvatarUrl(comment.author.image)} alt={comment.author.name} />}
                      <AvatarFallback>
                        <HugeiconsIcon icon={UserIcon} className="size-4" />
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">{comment.author?.name ?? `User #${comment.author_id}`}</span>
                          {comment.author?.username && <span className="text-xs text-muted-foreground">@{comment.author.username}</span>}
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <HugeiconsIcon icon={Calendar03Icon} className="size-3" />
                            {new Date(comment.createdAt).toLocaleDateString(i18n.language)}
                          </span>
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTarget(comment.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                        </Button>
                      </div>

                      <p className="text-sm mt-1 whitespace-pre-wrap">{comment.content}</p>

                      {comment.attachments && comment.attachments.length > 0 && (
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          {comment.attachments.map((attachment) => (
                            <div key={attachment.uuid} className="relative size-16 rounded-md overflow-hidden border bg-muted">
                              {attachment.type.startsWith("image") ? (
                                <PhotoWithFallback
                                  src={`/uploads/${attachment.uuid}.webp`}
                                  alt=""
                                  className="size-full object-cover"
                                  fallbackClassName="[&_svg]:size-4"
                                  fallbackLabelClassName="sr-only"
                                />
                              ) : (
                                <div className="flex items-center justify-center size-full">
                                  <HugeiconsIcon icon={Image01Icon} className="size-5 text-muted-foreground" />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleContent>
        </div>
      </Collapsible>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tAdmin("comments.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{tAdmin("comments.deleteDesc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tAdmin("common:actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => deleteTarget !== null && deleteMutation.mutate(deleteTarget)}
              disabled={deleteMutation.isPending}
            >
              {tAdmin("common:actions.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
