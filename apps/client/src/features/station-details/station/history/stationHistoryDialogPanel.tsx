import { ArrowUpRight01Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactNode, type RefObject, Suspense, lazy, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { StationTitle } from "../../components/stationTitle";
import { stationHistoryQueryOptions } from "./api";
import { groupHistoryByDay } from "./entries";
import { HistoryEntry } from "./historyEntry";
import { useHistoryNames } from "./lookups";
import { Button } from "@/components/ui/button";
import { CloseButton } from "@/components/ui/close-button";
import { ErrorState, InlineError, StaleDataNotice } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useReferenceAccess } from "@/features/admin/reference/access/useReferenceAccess";
import { useFloatingDialogFocus } from "@/features/floating-dialogs/hooks/useFloatingDialogFocus";
import type { FloatingDialogPanelFrameProps, StationHistoryDialogPayload } from "@/features/floating-dialogs/types";
import { useSettledSession } from "@/hooks/useSettledSession";
import { getOperatorColor, getOperatorHeaderTintGradient } from "@/lib/cellular/operators";
import { cn } from "@/lib/utils";

type StationHistoryDialogPanelProps = FloatingDialogPanelFrameProps & StationHistoryDialogPayload;
type RevertTarget = { operationId: number; entryIds: number[] };
type HistoryLoadMoreProps = {
  scrollRootRef: RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  isRefreshing: boolean;
  hasFailed: boolean;
  onLoadMore: () => unknown;
};

const SKELETON_ROWS = [0, 1, 2];
const PRELOAD_MARGIN = "200px";

const RevertOperationDialog = lazy(() =>
  import("@/features/admin/audit-operations/components/revertDialog").then((module) => ({ default: module.RevertOperationDialog })),
);

function HistorySkeleton() {
  const { t } = useTranslation("common");

  return (
    <>
      <output className="sr-only">{t("actions.loading")}</output>
      <div className="divide-y divide-border/60" aria-hidden="true">
        {SKELETON_ROWS.map((row) => (
          <div key={row} className="flex gap-2.5 py-2.5 first:pt-1">
            <Skeleton className="size-7 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-3.5 w-44" />
              <Skeleton className="h-3 w-full max-w-64" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function HistoryLoadMore({ scrollRootRef, isLoading, isRefreshing, hasFailed, onLoadMore }: HistoryLoadMoreProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isBusy = isLoading || isRefreshing;

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (sentinel === null || isBusy || hasFailed) return;
    const observer = new IntersectionObserver(
      (observed) => {
        if (observed.some((entry) => entry.isIntersecting)) void onLoadMore();
      },
      { root: scrollRootRef.current, rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [scrollRootRef, isBusy, hasFailed, onLoadMore]);

  return (
    <div ref={sentinelRef} className="py-2">
      {hasFailed ? (
        <InlineError size="sm" title={t("history.loadMoreError")} onRetry={onLoadMore} isRetrying={isLoading} />
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full cursor-pointer data-disabled:pointer-events-none data-disabled:opacity-50"
          disabled={isBusy}
          focusableWhenDisabled
          onClick={() => void onLoadMore()}
        >
          {isLoading ? t("common:actions.loading") : t("history.loadMore")}
        </Button>
      )}
    </div>
  );
}

export function StationHistoryDialogPanel({
  stationId,
  stationCode,
  operatorName,
  operatorMnc,
  onClose,
  modal = false,
  className,
  contentClassName,
  contentRef,
  bodyRef,
  bodyContentRef,
  style,
  headerDragProps,
}: StationHistoryDialogPanelProps) {
  const { t, i18n } = useTranslation(["stationDetails", "common"]);
  const titleId = useId();
  const windowRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const { data: session } = useSettledSession();
  const { canOpenCountries: canOpenAuditLog } = useReferenceAccess();
  const names = useHistoryNames();
  const [revertTarget, setRevertTarget] = useState<RevertTarget | null>(null);
  const [isRevertOpen, setIsRevertOpen] = useState(false);
  const { data, isError, isFetchNextPageError, isFetchingNextPage, isPending, isRefetchError, isRefetching, hasNextPage, fetchNextPage, refetch } =
    useInfiniteQuery(stationHistoryQueryOptions(stationId));

  useImperativeHandle(bodyRef, () => scrollContainerRef.current!);
  useFloatingDialogFocus(windowRef, closeButtonRef, !modal);

  const canOpenAdminHistory = canOpenAuditLog || session?.user?.role === "editor";
  const adminHistoryLabel = canOpenAuditLog ? t("history.openAuditLog") : t("common:labels.submissions");
  const items = data?.pages.flatMap((page) => page.data) ?? [];
  const groups = groupHistoryByDay(items, i18n.language);
  const hasNoItems = items.length === 0;
  const hasFailed = isError && hasNoItems;
  const isEmpty = hasNoItems && !hasNextPage;
  const fillsBody = !isPending && (hasFailed || isEmpty);

  function requestRevert(operationId: number, entryIds: number[]): void {
    setRevertTarget({ operationId, entryIds });
    setIsRevertOpen(true);
  }

  function loadNextPage(): Promise<unknown> {
    return fetchNextPage({ cancelRefetch: false });
  }

  let historyContent: ReactNode;
  if (isPending) {
    historyContent = <HistorySkeleton />;
  } else if (hasFailed) {
    historyContent = <ErrorState className="flex-1" title={t("history.error")} onRetry={() => refetch()} isRetrying={isRefetching} />;
  } else if (isEmpty) {
    historyContent = (
      <div className="flex min-h-56 flex-1 flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
        <HugeiconsIcon icon={Clock01Icon} className="size-7 text-muted-foreground" aria-hidden="true" />
        <h3 className="mt-3 text-sm font-semibold text-foreground">{t("common:empty.changes")}</h3>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">{t("history.emptyHint")}</p>
      </div>
    );
  } else {
    historyContent = (
      <>
        {isRefetchError ? (
          <div className="mb-1 flex justify-center">
            <StaleDataNotice message={t("history.refreshError")} onRetry={() => refetch()} isRetrying={isRefetching} />
          </div>
        ) : null}
        {hasNoItems ? (
          <HistorySkeleton />
        ) : (
          groups.map((group) => (
            <section key={group.key} aria-label={group.label}>
              <h3 className="sticky top-0 z-10 -mx-3 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground sm:-mx-4 sm:px-4">
                {group.label}
              </h3>
              <div className="divide-y divide-border/60">
                {group.entries.map((entry) => (
                  <HistoryEntry
                    key={entry.key}
                    item={entry.item}
                    part={entry.part}
                    revertParts={entry.revertParts}
                    names={names}
                    canOpenAuditLog={canOpenAuditLog}
                    onRevert={requestRevert}
                  />
                ))}
              </div>
            </section>
          ))
        )}
        {hasNextPage ? (
          <HistoryLoadMore
            scrollRootRef={scrollContainerRef}
            isLoading={isFetchingNextPage}
            isRefreshing={isRefetching}
            hasFailed={isFetchNextPageError}
            onLoadMore={loadNextPage}
          />
        ) : (
          <p className="py-2 text-center text-xs text-muted-foreground">{t("history.end")}</p>
        )}
      </>
    );
  }

  return (
    <>
      <div
        ref={windowRef}
        className={cn("relative", className)}
        style={style}
        role={modal ? undefined : "dialog"}
        aria-labelledby={modal ? undefined : titleId}
      >
        <div
          ref={contentRef}
          className={cn(
            "relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl bg-background shadow-2xl",
            contentClassName,
          )}
        >
          <div {...headerDragProps} className={cn("shrink-0 border-b bg-background/95 backdrop-blur-sm", headerDragProps?.className)}>
            <div
              className="flex items-start gap-3 px-4 py-3 sm:px-6 sm:py-3.5"
              style={{ backgroundImage: getOperatorHeaderTintGradient(getOperatorColor(operatorMnc ?? 0)) }}
            >
              <div id={titleId} className="min-w-0 flex-1">
                <h2 className="min-w-0 truncate text-base font-semibold leading-5 tracking-tight text-foreground">{t("history.title")}</h2>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                  <StationTitle
                    stationId={stationCode}
                    operator={{ name: operatorName, mnc: operatorMnc ?? 0 }}
                    stationIdClassName="text-xs text-muted-foreground"
                  />
                </div>
              </div>
              <div className="-mt-1 -mr-2 flex shrink-0 items-center gap-1">
                {isRefetching && !isFetchingNextPage ? (
                  <output className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <span aria-hidden className="size-3 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-muted-foreground" />
                    <span className="sr-only sm:not-sr-only">{t("history.refreshing")}</span>
                  </output>
                ) : null}
                {canOpenAdminHistory ? (
                  <Link
                    to={canOpenAuditLog ? "/admin/audit-logs" : "/admin/submissions"}
                    search={canOpenAuditLog ? { q: String(stationId) } : { q: stationCode, page: 0 }}
                    target="_blank"
                    rel="noopener noreferrer"
                    onPointerDown={(event) => event.stopPropagation()}
                    aria-label={adminHistoryLabel}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="sr-only sm:not-sr-only">{adminHistoryLabel}</span>
                    <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-4" aria-hidden="true" />
                  </Link>
                ) : null}
                <CloseButton ref={closeButtonRef} onClick={onClose} onPointerDown={(event) => event.stopPropagation()} />
              </div>
            </div>
          </div>

          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto custom-scrollbar scrollbar-gutter-stable"
            aria-busy={isPending || isFetchingNextPage}
          >
            <div ref={bodyContentRef} className={cn("px-3 py-2 sm:px-4 sm:py-2.5", fillsBody && "flex min-h-full flex-col")}>
              {historyContent}
            </div>
          </div>
        </div>
      </div>
      {revertTarget !== null ? (
        <Suspense fallback={null}>
          <RevertOperationDialog
            operationId={revertTarget.operationId}
            entryIds={revertTarget.entryIds}
            open={isRevertOpen}
            onOpenChange={setIsRevertOpen}
            className="z-60"
          />
        </Suspense>
      ) : null}
    </>
  );
}
