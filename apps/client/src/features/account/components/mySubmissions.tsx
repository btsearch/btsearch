import { Add01Icon, AlertCircleIcon, Delete02Icon, PencilEdit02Icon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SUBMISSION_STATUS, SUBMISSION_TYPE } from "@/features/admin/submissions/submissionUI";
import type { SubmissionRow } from "@/features/admin/submissions/types";
import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import { deleteSubmission } from "@/features/submissions/api";
import { useMySubmissions } from "@/features/submissions/hooks/useMySubmissions";
import { showApiError } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const ESTIMATED_ROW_HEIGHT = 56;

export function MySubmissions() {
  const { t, i18n } = useTranslation(["submissions", "common"]);
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  const { data, isLoading, error, isFetchingNextPage, hasNextPage, fetchNextPage } = useMySubmissions(userId);

  const deleteMutation = useMutation({
    mutationFn: deleteSubmission,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-submissions", userId] });
      toast.success(t("toast.deleted"));
    },
    onError: (error) => showApiError(error),
  });

  const submissions = useMemo<SubmissionRow[]>(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const { openStationDialog } = useFloatingDialogStack();
  const handleStationClick = useCallback((stationId: number) => openStationDialog(stationId, "internal"), [openStationDialog]);

  const virtualizer = useVirtualizer({
    count: submissions.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 5,
    gap: 8,
  });

  const items = virtualizer.getVirtualItems();
  const hasVirtualItems = items.length > 0;

  const handleScrollRef = useRef<() => void>(null!);
  handleScrollRef.current = () => {
    if (!hasNextPage || isFetchingNextPage) return;
    const lastItem = items[items.length - 1];
    if (!lastItem) return;
    if (lastItem.index >= submissions.length - 1) {
      void fetchNextPage();
    }
  };

  useEffect(() => {
    if (!scrollEl) return;
    const handler = () => handleScrollRef.current();
    scrollEl.addEventListener("scroll", handler, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handler);
  }, [scrollEl]);

  useEffect(() => {
    handleScrollRef.current();
  }, [submissions.length, hasVirtualItems]);

  if (isLoading) {
    return (
      <div className="divide-y divide-border/50">
        {[1, 2, 3].map((i) => (
          <div key={`skeleton-${i}`} className="flex items-center gap-4 px-3 py-2.5">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-32 rounded ml-auto" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
        <div className="size-10 rounded-full bg-destructive/5 flex items-center justify-center text-destructive/50 mb-3">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
        </div>
        <p className="text-sm">{t("common:placeholder.errorFetching")}</p>
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
        <HugeiconsIcon icon={SentIcon} className="size-8 mb-2 opacity-30" />
        <p className="text-sm font-medium">{t("table.empty")}</p>
        <p className="text-xs mt-1">{t("table.emptyHintUser")}</p>
        <Button size="sm" className="mt-4" nativeButton={false} render={<Link to="/submission" />}>
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          {t("submitNew")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <div ref={setScrollEl} className="flex-1 overflow-y-auto">
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {items.map((virtualItem) => {
            const submission = submissions[virtualItem.index];
            const statusCfg = SUBMISSION_STATUS[submission.status];
            const typeCfg = SUBMISSION_TYPE[submission.type];
            const hasNotes = !!submission.review_notes;
            const hasReview = hasNotes || !!submission.reviewer;
            const stationId = submission.station_id;

            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div className="group border-b border-border/50 hover:bg-muted/40 transition-colors">
                  <div className="flex items-center gap-3 px-3 py-2.5 min-w-0">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider border shrink-0",
                        typeCfg.badgeClass,
                      )}
                    >
                      <span className={cn("size-1.5 rounded-[1px]", typeCfg.dotClass)} />
                      {t(`common:submissionType.${submission.type}`)}
                    </span>

                    {submission.station?.station_id ? (
                      stationId !== null ? (
                        <button
                          type="button"
                          onClick={() => handleStationClick(stationId)}
                          className="text-sm font-mono font-medium text-foreground truncate max-w-56 hover:underline cursor-pointer"
                        >
                          {submission.station.station_id}
                        </button>
                      ) : (
                        <span className="text-sm font-mono font-medium text-foreground truncate max-w-56">{submission.station.station_id}</span>
                      )
                    ) : submission.proposedStation?.station_id ? (
                      <span className="text-sm font-mono font-medium text-foreground truncate max-w-56">{submission.proposedStation.station_id}</span>
                    ) : null}

                    <div className="ml-auto flex items-center gap-3">
                      {submission.status === "pending" && (
                        <div className="flex items-center gap-1">
                          <Tooltip>
                            <TooltipTrigger render={<span />}>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                nativeButton={false}
                                render={<Link to="/submission" search={{ edit: submission.id }} />}
                              >
                                <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{t("mySubmissions.editTooltip")}</TooltipContent>
                          </Tooltip>
                          <AlertDialog>
                            <Tooltip>
                              <TooltipTrigger render={<span />}>
                                <AlertDialogTrigger render={<Button size="icon-sm" variant="ghost" />}>
                                  <HugeiconsIcon icon={Delete02Icon} className="size-3.5 text-destructive" />
                                </AlertDialogTrigger>
                              </TooltipTrigger>
                              <TooltipContent>{t("mySubmissions.deleteTooltip")}</TooltipContent>
                            </Tooltip>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("mySubmissions.confirmDelete")}</AlertDialogTitle>
                                <AlertDialogDescription>{t("mySubmissions.confirmDeleteDesc")}</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  variant="destructive"
                                  onClick={() => deleteMutation.mutate(submission.id)}
                                  disabled={deleteMutation.isPending}
                                >
                                  {t("common:actions.delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
                      <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md", statusCfg.bgClass)}>
                        <HugeiconsIcon icon={statusCfg.icon} className={cn("size-3.5", statusCfg.iconClass)} />
                        <span className="text-xs font-medium capitalize">{t(`common:status.${submission.status}`)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground tabular-nums hidden sm:inline">
                        {formatShortDate(submission.createdAt, i18n.language)}
                      </span>
                    </div>
                  </div>

                  {hasReview && (
                    <div className="px-3 pb-2.5 pt-0">
                      <div className="bg-muted/60 rounded-lg px-3 py-2.5 space-y-1">
                        {submission.reviewer && (
                          <p className="text-[11px] text-muted-foreground">
                            {t("mySubmissions.reviewedBy")} <span className="font-medium text-foreground">{submission.reviewer.name}</span>
                            {submission.reviewer.username && <span> (@{submission.reviewer.username})</span>}
                          </p>
                        )}
                        {hasNotes && (
                          <p className="text-sm leading-relaxed text-foreground wrap-break-word whitespace-pre-wrap">{submission.review_notes}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {isFetchingNextPage && (
          <div className="flex justify-center py-4">
            <Spinner className="size-4" />
          </div>
        )}
      </div>
    </>
  );
}
