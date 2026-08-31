import {
  Add01Icon,
  AlertCircleIcon,
  Cancel01Icon,
  Delete02Icon,
  FullSignalIcon,
  PencilEdit02Icon,
  Search01Icon,
  SentIcon,
  TaskDaily01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
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
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavActionTarget } from "@/contexts/navActions";
import { StationIdentityCell } from "@/features/admin/submissions/components/stationIdentityCell";
import { SUBMISSION_STATUS } from "@/features/admin/submissions/submissionUI";
import type { SubmissionRow } from "@/features/admin/submissions/types";
import { operatorsQueryOptions } from "@/features/shared/queries";
import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import type { MySubmissionsFilters } from "@/features/submissions/api";
import { deleteSubmission } from "@/features/submissions/api";
import { SubmissionTypeBadge } from "@/features/submissions/components/submissionTypeBadge";
import { useMySubmissions } from "@/features/submissions/hooks/useMySubmissions";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { showApiError } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { formatShortDate } from "@/lib/format";
import { getOperatorColor } from "@/lib/operatorUtils";
import { cn, toggleValue } from "@/lib/utils";
import type { Operator } from "@/types/station";

const ESTIMATED_ROW_HEIGHT = 44;

const STATUS_FILTERS = ["all", "pending", "approved", "rejected"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const STATUS_STORAGE_KEY = "account:submissions:status";
const OPERATORS_STORAGE_KEY = "account:submissions:operators";

function loadStoredStatus(): StatusFilter {
  try {
    const stored = localStorage.getItem(STATUS_STORAGE_KEY);
    return STATUS_FILTERS.find((status) => status === stored) ?? "all";
  } catch {
    return "all";
  }
}

function loadStoredOperatorMncs(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(OPERATORS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === "number" && Number.isFinite(value)) : [];
  } catch {
    return [];
  }
}

type MySubmissionsFilterProps = {
  statusFilter: StatusFilter;
  selectedOperators: Operator[];
  operators: Operator[];
  searchInput: string;
  onStatusChange: (status: StatusFilter) => void;
  onOperatorChange: (operators: Operator[]) => void;
  onSearchChange: (value: string) => void;
};

function MySubmissionsMobileFilterRail({
  statusFilter,
  selectedOperators,
  operators,
  searchInput,
  onStatusChange,
  onOperatorChange,
  onSearchChange,
}: MySubmissionsFilterProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const hasSearch = searchInput.trim().length > 0;

  return (
    <div className="flex items-center gap-1">
      <MobileFilterChip active={hasSearch} icon={Search01Icon} label={t("common:labels.search")}>
        <MobileFilterPanelTitle>{t("common:labels.search")}</MobileFilterPanelTitle>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="h-9 w-full pl-8 pr-8"
            placeholder={t("table.searchPlaceholder")}
            value={searchInput}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
          {hasSearch ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t("common:actions.clear")}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          ) : null}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={statusFilter !== "all"} icon={TaskDaily01Icon} label={t("common:labels.status")}>
        <MobileFilterPanelTitle>{t("common:labels.status")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onStatusChange(status)}
              className={cn(
                "h-8 rounded-md px-2 text-left text-sm transition-colors",
                statusFilter === status ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              {status === "all" ? t("common:status.all", "All") : t(`common:status.${status}`)}
            </button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip
        active={selectedOperators.length > 0}
        count={selectedOperators.length}
        icon={FullSignalIcon}
        label={t("common:labels.operator")}
      >
        <MobileFilterPanelTitle>{t("common:labels.operator")}</MobileFilterPanelTitle>
        <div className="grid gap-1">
          {operators.map((operator) => {
            const selected = selectedOperators.some((value) => value.id === operator.id);
            return (
              <button
                key={operator.id}
                type="button"
                onClick={() => onOperatorChange(toggleValue(selectedOperators, operator))}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                  selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: getOperatorColor(operator.mnc) }} />
                <span className="min-w-0 flex-1 truncate">{operator.name}</span>
              </button>
            );
          })}
        </div>
      </MobileFilterChip>
    </div>
  );
}

function MySubmissionsDesktopFilters({
  statusFilter,
  selectedOperators,
  operators,
  searchInput,
  onStatusChange,
  onOperatorChange,
  onSearchChange,
}: MySubmissionsFilterProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const operatorChipsRef = useRef<HTMLDivElement>(null);

  const visibleSelectedOperators = selectedOperators.slice(0, 1);
  const hiddenSelectedOperatorCount = selectedOperators.length - visibleSelectedOperators.length;

  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
      <div className="flex items-center p-1 bg-muted/50 rounded-lg border w-fit">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            onClick={() => onStatusChange(status)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-all capitalize",
              statusFilter === status
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground hover:bg-muted",
            )}
          >
            {status === "all" ? t("common:status.all", "All") : t(`common:status.${status}`)}
          </button>
        ))}
      </div>

      <div className="w-full sm:w-44">
        <Combobox multiple value={selectedOperators} onValueChange={onOperatorChange} items={operators}>
          <ComboboxChips
            ref={operatorChipsRef}
            className="h-8 min-h-8 max-h-8 flex-nowrap overflow-hidden text-sm has-data-[slot=combobox-chip]:px-2.5"
          >
            <HugeiconsIcon icon={FullSignalIcon} className="size-3.5 shrink-0 text-muted-foreground pointer-events-none" />
            {visibleSelectedOperators.map((operator) => (
              <ComboboxChip key={operator.id} className="max-w-20 shrink-0">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="size-2 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(operator.mnc) }} />
                  <span className="truncate">{operator.name}</span>
                </span>
              </ComboboxChip>
            ))}
            {hiddenSelectedOperatorCount > 0 ? (
              <ComboboxChip showRemove={false} className="shrink-0 text-muted-foreground">
                +{hiddenSelectedOperatorCount}
              </ComboboxChip>
            ) : null}
            <ComboboxChipsInput
              className={selectedOperators.length === 0 ? "min-w-0" : "min-w-2 w-2 flex-none"}
              placeholder={selectedOperators.length === 0 ? t("common:labels.allOperators") : ""}
            />
          </ComboboxChips>
          <ComboboxContent anchor={operatorChipsRef}>
            <ComboboxList>
              <ComboboxEmpty>-</ComboboxEmpty>
              {operators.map((operator) => (
                <ComboboxItem key={operator.id} value={operator}>
                  <span className="size-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(operator.mnc) }} />
                  <span className="truncate">{operator.name}</span>
                </ComboboxItem>
              ))}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>

      <div className="relative w-full sm:w-auto">
        <HugeiconsIcon
          icon={Search01Icon}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
        />
        <Input
          className="h-8 pl-8 pr-8 w-full sm:w-72"
          placeholder={t("table.searchPlaceholder")}
          value={searchInput}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
        />
        {searchInput ? (
          <button
            type="button"
            onClick={() => onSearchChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={t("common:actions.clear")}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function MySubmissions() {
  const { t, i18n } = useTranslation(["submissions", "common"]);
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id;

  const navActionTarget = useNavActionTarget();
  const showFloatingMobileFilters = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(loadStoredStatus);
  const [selectedOperatorMncs, setSelectedOperatorMncs] = useState<number[]>(loadStoredOperatorMncs);
  const [searchInput, setSearchInput] = useState("");
  const activeSearch = useDebouncedValue(searchInput, 300);

  const { data: operators = [] } = useQuery(operatorsQueryOptions());
  const { operatorById, operatorByMnc } = useMemo(() => {
    const byId = new Map<number, Operator>();
    const byMnc = new Map<number, Operator>();
    for (const operator of operators) {
      byId.set(operator.id, operator);
      byMnc.set(operator.mnc, operator);
    }
    return { operatorById: byId, operatorByMnc: byMnc };
  }, [operators]);
  const getOperatorById = useCallback(
    (operatorId: number | null | undefined) => (operatorId !== null && operatorId !== undefined ? operatorById.get(operatorId) : undefined),
    [operatorById],
  );
  const selectedOperators = useMemo(
    () => selectedOperatorMncs.map((mnc) => operatorByMnc.get(mnc)).filter((operator): operator is Operator => operator !== undefined),
    [selectedOperatorMncs, operatorByMnc],
  );

  const handleStatusChange = useCallback((status: StatusFilter) => {
    setStatusFilter(status);
    localStorage.setItem(STATUS_STORAGE_KEY, status);
  }, []);

  const handleOperatorChange = useCallback((next: Operator[]) => {
    const mncs = next.map((operator) => operator.mnc);
    setSelectedOperatorMncs(mncs);
    localStorage.setItem(OPERATORS_STORAGE_KEY, JSON.stringify(mncs));
  }, []);

  const handleClearFilters = useCallback(() => {
    handleStatusChange("all");
    handleOperatorChange([]);
    setSearchInput("");
  }, [handleStatusChange, handleOperatorChange]);

  const filters = useMemo<MySubmissionsFilters>(
    () => ({
      status: statusFilter === "all" ? undefined : statusFilter,
      operatorMncs: selectedOperatorMncs,
      search: activeSearch,
    }),
    [statusFilter, selectedOperatorMncs, activeSearch],
  );

  const hasActiveFilters = statusFilter !== "all" || selectedOperatorMncs.length > 0 || activeSearch.trim().length > 0;

  const { data, isLoading, error, isRefetching, isFetchingNextPage, hasNextPage, fetchNextPage, refetch } = useMySubmissions(userId, filters);

  const deleteMutation = useMutation({
    mutationFn: deleteSubmission,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-submissions", userId] });
      toast.success(t("toast.deleted"));
    },
    onError: (error) => showApiError(error),
  });

  const submissions = useMemo<SubmissionRow[]>(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const totalSubmissionCount = data?.pages[0]?.totalCount ?? submissions.length;
  const hasLoadedSubmissions = submissions.length > 0;
  const showStaleDataWarning = error !== null && hasLoadedSubmissions;

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const { openStationDialog } = useFloatingDialogStack();
  const handleStationClick = useCallback((stationId: number) => openStationDialog(stationId, "internal"), [openStationDialog]);

  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual requires the compiler's automatic bailout
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

  const listContent = isLoading ? (
    <div className="divide-y divide-border/50">
      {[1, 2, 3].map((i) => (
        <div key={`skeleton-${i}`} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 px-3 py-2.5 md:flex md:gap-3">
          <Skeleton className="col-span-2 col-start-1 row-start-1 h-4 w-32 max-w-full rounded md:order-2 md:mr-auto" />
          <Skeleton className="col-start-3 row-start-1 h-5 w-16 justify-self-end rounded-full md:order-4" />
          <Skeleton className="col-start-1 row-start-2 h-5 w-14 rounded-full md:order-1" />
          <Skeleton className="col-start-2 row-start-2 h-3 w-16 rounded md:order-5" />
          <Skeleton className="col-start-3 row-start-2 h-6 w-12 justify-self-end rounded md:order-3" />
        </div>
      ))}
    </div>
  ) : error !== null && !hasLoadedSubmissions ? (
    <div role="alert" className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
      <div className="size-10 rounded-full bg-destructive/5 flex items-center justify-center text-destructive/50 mb-3">
        <HugeiconsIcon icon={AlertCircleIcon} className="size-5" />
      </div>
      <p className="text-sm">{t("common:placeholder.errorFetching")}</p>
      <Button size="sm" variant="outline" className="mt-4" onClick={() => void refetch()} disabled={isRefetching}>
        {isRefetching ? <Spinner className="size-3.5" /> : null}
        {t("common:actions.retry")}
      </Button>
    </div>
  ) : !hasLoadedSubmissions ? (
    <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
      <HugeiconsIcon icon={hasActiveFilters ? Search01Icon : SentIcon} className="size-8 mb-2 opacity-30" />
      <p className="text-sm font-medium">{t("table.empty")}</p>
      <p className="text-xs mt-1">{hasActiveFilters ? t("table.emptyHint") : t("table.emptyHintUser")}</p>
      {hasActiveFilters ? (
        <Button size="sm" variant="outline" className="mt-4" onClick={handleClearFilters}>
          {t("common:actions.clearAll")}
        </Button>
      ) : (
        <Button size="sm" className="mt-4" nativeButton={false} render={<Link to="/submission" />}>
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          {t("submitNew")}
        </Button>
      )}
    </div>
  ) : (
    <>
      <div
        role="list"
        aria-label={t("userPage.title")}
        aria-busy={isRefetching || isFetchingNextPage}
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {items.map((virtualItem) => {
          const submission = submissions[virtualItem.index];
          const statusCfg = SUBMISSION_STATUS[submission.status];
          const hasNotes = !!submission.review_notes;
          const hasReview = hasNotes || !!submission.reviewer;
          const stationId = submission.station_id;
          const submissionIdentityId = `submission-${submission.id}-identity`;
          const reviewHeadingId = `submission-${submission.id}-review-heading`;

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              role="listitem"
              aria-posinset={virtualItem.index + 1}
              aria-setsize={totalSubmissionCount}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <article aria-labelledby={submissionIdentityId} className="group border-b border-border/50 hover:bg-muted/40 transition-colors">
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 px-3 py-2.5 md:flex md:gap-3">
                  <div id={submissionIdentityId} className="col-span-2 col-start-1 row-start-1 min-w-0 md:order-2 md:flex-1">
                    {submission.station ? (
                      <StationIdentityCell
                        stationId={submission.station.station_id}
                        operator={getOperatorById(submission.station.operator_id)}
                        fallback={t("common:labels.newStation")}
                        onStationClick={stationId !== null ? () => handleStationClick(stationId) : undefined}
                      />
                    ) : (
                      <StationIdentityCell
                        stationId={submission.proposedStation?.station_id ?? null}
                        operator={getOperatorById(submission.proposedStation?.operator_id)}
                        fallback={t("common:labels.newStation")}
                      />
                    )}
                  </div>

                  <div
                    className={cn(
                      "col-start-3 row-start-1 flex shrink-0 items-center gap-1.5 justify-self-end rounded-md px-2 py-1 md:order-4",
                      statusCfg.bgClass,
                    )}
                  >
                    <HugeiconsIcon icon={statusCfg.icon} className={cn("size-3.5", statusCfg.iconClass)} />
                    <span className="whitespace-nowrap text-xs font-medium capitalize">{t(`common:status.${submission.status}`)}</span>
                  </div>

                  <div className="col-start-1 row-start-2 justify-self-start md:order-1">
                    <SubmissionTypeBadge type={submission.type} />
                  </div>

                  <time
                    dateTime={submission.createdAt}
                    className="col-start-2 row-start-2 self-center whitespace-nowrap text-[11px] text-muted-foreground tabular-nums md:order-5 md:text-xs"
                  >
                    {formatShortDate(submission.createdAt, i18n.language)}
                  </time>

                  {submission.status === "pending" ? (
                    <div className="col-start-3 row-start-2 flex items-center gap-1 justify-self-end md:order-3">
                      <Tooltip>
                        <TooltipTrigger render={<span />}>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            nativeButton={false}
                            render={<Link to="/submission" search={{ edit: submission.id }} />}
                            aria-label={t("mySubmissions.editTooltip")}
                          >
                            <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("mySubmissions.editTooltip")}</TooltipContent>
                      </Tooltip>
                      <AlertDialog>
                        <Tooltip>
                          <TooltipTrigger render={<span />}>
                            <AlertDialogTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("mySubmissions.deleteTooltip")} />}>
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
                  ) : null}
                </div>

                {hasReview && (
                  <div className="px-3 pb-2.5 pt-0">
                    <section aria-labelledby={reviewHeadingId} className="bg-muted/60 rounded-lg px-3 py-2.5 space-y-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <h3 id={reviewHeadingId} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {hasNotes ? t("detail.reviewNotes") : t("table.review")}
                        </h3>
                        {submission.reviewer && (
                          <p className="text-[11px] text-muted-foreground">
                            {t("mySubmissions.reviewedBy")} <span className="font-medium text-foreground">{submission.reviewer.name}</span>
                            {submission.reviewer.username && <span> (@{submission.reviewer.username})</span>}
                          </p>
                        )}
                      </div>
                      {hasNotes && (
                        <p className="text-sm leading-relaxed text-foreground wrap-break-word whitespace-pre-wrap">{submission.review_notes}</p>
                      )}
                    </section>
                  </div>
                )}
              </article>
            </div>
          );
        })}
      </div>

      {isFetchingNextPage ? (
        <div className="flex justify-center py-4">
          <Spinner className="size-4" />
        </div>
      ) : null}
    </>
  );

  return (
    <>
      <div className="shrink-0 space-y-2">
        <div className={cn(showFloatingMobileFilters && "max-md:hidden")}>
          <MySubmissionsDesktopFilters
            statusFilter={statusFilter}
            selectedOperators={selectedOperators}
            operators={operators}
            searchInput={searchInput}
            onStatusChange={handleStatusChange}
            onOperatorChange={handleOperatorChange}
            onSearchChange={setSearchInput}
          />
        </div>

        {showStaleDataWarning ? (
          <div
            role="status"
            className="flex min-w-0 items-center gap-2 rounded-md border border-amber-600/30 bg-amber-500/10 px-2.5 py-1.5 text-foreground"
          >
            <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
            <p className="min-w-0 flex-1 text-xs">{t("mySubmissions.staleDataWarning")}</p>
            <Button size="xs" variant="ghost" onClick={() => void refetch()} disabled={isRefetching}>
              {isRefetching ? <Spinner className="size-3" /> : null}
              {t("common:actions.retry")}
            </Button>
          </div>
        ) : null}
      </div>

      <div ref={setScrollEl} className={cn("flex-1 min-h-0 overflow-y-auto", showFloatingMobileFilters && "max-md:mb-10")}>
        {listContent}
      </div>

      {navActionTarget &&
        createPortal(
          showFloatingMobileFilters ? (
            <div className="max-md:w-[calc(100vw-1.5rem)] max-md:min-w-0 max-md:gap-1">
              <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden md:hidden">
                <div className="w-max mx-auto">
                  <MySubmissionsMobileFilterRail
                    statusFilter={statusFilter}
                    selectedOperators={selectedOperators}
                    operators={operators}
                    searchInput={searchInput}
                    onStatusChange={handleStatusChange}
                    onOperatorChange={handleOperatorChange}
                    onSearchChange={setSearchInput}
                  />
                </div>
              </div>
            </div>
          ) : null,
          navActionTarget,
        )}
    </>
  );
}
