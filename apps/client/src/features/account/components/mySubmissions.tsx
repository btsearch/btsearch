import {
  Add01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Delete02Icon,
  FullSignalIcon,
  Globe02Icon,
  PencilEdit02Icon,
  Search01Icon,
  SentIcon,
  TaskDaily01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Brand, Operator, Submission, SubmissionStatus } from "@openbts/shared/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
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
import { ErrorState, InlineError, StaleDataNotice } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavActionTarget } from "@/contexts/navActions";
import { toSubmissionListRow } from "@/features/admin/submissions/api";
import { StationIdentityCell } from "@/features/admin/submissions/components/stationIdentityCell";
import { SubmissionCountryFilter } from "@/features/admin/submissions/components/submissionCountryFilter";
import { SubmissionChangesSummary } from "@/features/admin/submissions/components/submissionListParts";
import { SubmissionOperatorFilter } from "@/features/admin/submissions/components/submissionOperatorFilter";
import { type SubmissionFilterScope, filterSubmissionIdsByCountries } from "@/features/admin/submissions/submissionFilterScope";
import { readCountryCodes } from "@/features/admin/submissions/submissionFilterStorage";
import type { SubmissionOperatorOption } from "@/features/admin/submissions/types";
import { resolveDisplayName } from "@/features/admin/users/utils/identity";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { findOperatorIdsByMncs } from "@/features/map/data/mapLookups";
import { bandsQueryOptions, brandsQueryOptions, operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { submissionPhotosQueryOptions } from "@/features/station-editing/data/submissionPhotos";
import { invalidateSubmissionQueries, withdrawSubmission } from "@/features/station-editing/data/submissions";
import { useListPanelScope } from "@/features/stations/list/data/listPanel";
import { SubmissionStatusBadge } from "@/features/submissions/components/submissionStatusBadge";
import { type MySubmissionsFilters, useMySubmissions } from "@/features/submissions/hooks/useMySubmissions";
import { UserLink } from "@/features/user-profile/components/userLink";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSettledSession } from "@/hooks/useSettledSession";
import { showApiError } from "@/lib/api";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const ESTIMATED_ROW_HEIGHT = 44;

const STATUS_FILTERS = ["all", "pending", "approved", "rejected"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const SUBMISSION_STATUSES: Record<Exclude<StatusFilter, "all">, SubmissionStatus> = {
  pending: "pending",
  approved: "accepted",
  rejected: "rejected",
};

const STATUS_STORAGE_KEY = "account:submissions:status";
const COUNTRY_CODES_STORAGE_KEY = "account:submissions:countryCodes";
const OPERATOR_IDS_STORAGE_KEY = "account:submissions:operatorIds";
const OPERATOR_MNCS_STORAGE_KEY = "account:submissions:operators";
const NO_OPERATORS: Operator[] = [];
const NO_OPERATOR_IDS: number[] = [];

type StoredOperatorFilter = {
  operatorIds: number[] | null;
  operatorMncs: number[];
};

type OpenedSubmission = {
  submission: Submission;
  listUpdatedAt: number;
};

type SubmissionsPage = {
  submissions: readonly Submission[];
};

function loadSubmissionChangesSheet(): Promise<typeof import("./submissionChangesSheet")> {
  return import("./submissionChangesSheet");
}

const SubmissionChangesSheet = lazy(() => loadSubmissionChangesSheet().then(({ SubmissionChangesSheet }) => ({ default: SubmissionChangesSheet })));

function SubmissionChangesSheetFallback() {
  const { t } = useTranslation("submissions");
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" aria-hidden="true" />
      <aside
        role="status"
        aria-live="polite"
        className="fixed inset-y-0 right-0 z-50 flex w-full items-center justify-center border-l bg-background p-6 shadow-lg sm:max-w-xl"
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          {t("changesSheet.loading")}
        </div>
      </aside>
    </>
  );
}

function loadStoredStatus(): StatusFilter {
  try {
    const stored = localStorage.getItem(STATUS_STORAGE_KEY);
    return STATUS_FILTERS.find((status) => status === stored) ?? "all";
  } catch {
    return "all";
  }
}

function loadStoredCountryCodes(): string[] {
  try {
    const stored = localStorage.getItem(COUNTRY_CODES_STORAGE_KEY);
    return stored === null ? [] : readCountryCodes(JSON.parse(stored));
  } catch {
    return [];
  }
}

function storeCountryCodes(countryCodes: readonly string[]): void {
  try {
    localStorage.setItem(COUNTRY_CODES_STORAGE_KEY, JSON.stringify(countryCodes));
  } catch {
    return;
  }
}

function storeStatus(status: StatusFilter): void {
  try {
    localStorage.setItem(STATUS_STORAGE_KEY, status);
  } catch {
    return;
  }
}

function readStoredNumbers(storageKey: string): number[] | null {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === null) return null;

    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === "number" && Number.isFinite(value)) : null;
  } catch {
    return null;
  }
}

function loadStoredOperatorFilter(): StoredOperatorFilter {
  return { operatorIds: readStoredNumbers(OPERATOR_IDS_STORAGE_KEY), operatorMncs: readStoredNumbers(OPERATOR_MNCS_STORAGE_KEY) ?? [] };
}

function storeOperatorIds(operatorIds: readonly number[]): void {
  try {
    localStorage.setItem(OPERATOR_IDS_STORAGE_KEY, JSON.stringify(operatorIds));
    localStorage.removeItem(OPERATOR_MNCS_STORAGE_KEY);
  } catch {
    return;
  }
}

function toOperatorOption(operator: Operator, brands: readonly Brand[] | undefined): SubmissionOperatorOption {
  return { id: operator.id, name: operator.name, brand: getOperatorBrand(operator, brands) };
}

function listUniqueSubmissions(pages: readonly SubmissionsPage[]): Submission[] {
  const seenIds = new Set<string>();
  const submissions: Submission[] = [];

  for (const page of pages) {
    for (const submission of page.submissions) {
      if (seenIds.has(submission.id)) continue;

      seenIds.add(submission.id);
      submissions.push(submission);
    }
  }
  return submissions;
}

type MySubmissionsFilterProps = {
  statusFilter: StatusFilter;
  countryCodes: string[];
  operatorIds: number[];
  scope: SubmissionFilterScope;
  searchInput: string;
  onStatusChange: (status: StatusFilter) => void;
  onCountryChange: (countryCodes: string[]) => void;
  onOperatorChange: (operatorIds: number[]) => void;
  onSearchChange: (value: string) => void;
};

function MySubmissionsMobileFilterRail({
  statusFilter,
  countryCodes,
  operatorIds,
  scope,
  searchInput,
  onStatusChange,
  onCountryChange,
  onOperatorChange,
  onSearchChange,
}: MySubmissionsFilterProps) {
  const { t } = useTranslation(["submissions", "common", "main"]);
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
            {...NO_AUTOFILL_PROPS}
            className="h-9 w-full pl-8 pr-8"
            placeholder={t("table.searchPlaceholder")}
            value={searchInput}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
          {hasSearch ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className={cn(
                "absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full",
                "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
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
              aria-pressed={statusFilter === status}
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

      <MobileFilterChip active={countryCodes.length > 0} count={countryCodes.length} icon={Globe02Icon} label={t("main:filters.country")}>
        <MobileFilterPanelTitle>{t("main:filters.country")}</MobileFilterPanelTitle>
        <SubmissionCountryFilter countryCodes={countryCodes} options={scope.countries.options} onChange={onCountryChange} isInline />
      </MobileFilterChip>
      <MobileFilterChip active={operatorIds.length > 0} count={operatorIds.length} icon={FullSignalIcon} label={t("common:labels.operator")}>
        <MobileFilterPanelTitle>{t("common:labels.operator")}</MobileFilterPanelTitle>
        <SubmissionOperatorFilter operatorIds={operatorIds} scope={scope} onChange={onOperatorChange} isInline />
      </MobileFilterChip>
    </div>
  );
}

function MySubmissionsDesktopFilters({
  statusFilter,
  countryCodes,
  operatorIds,
  scope,
  searchInput,
  onStatusChange,
  onCountryChange,
  onOperatorChange,
  onSearchChange,
}: MySubmissionsFilterProps) {
  const { t } = useTranslation(["submissions", "common", "main"]);

  return (
    <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2">
      <div className="flex items-center p-1 bg-muted/50 rounded-lg border w-fit">
        {STATUS_FILTERS.map((status) => (
          <button
            key={status}
            type="button"
            aria-pressed={statusFilter === status}
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
        <SubmissionCountryFilter countryCodes={countryCodes} options={scope.countries.options} onChange={onCountryChange} />
      </div>
      <div className="w-full sm:w-44">
        <SubmissionOperatorFilter operatorIds={operatorIds} scope={scope} onChange={onOperatorChange} />
      </div>

      <div className="relative w-full sm:w-auto">
        <HugeiconsIcon
          icon={Search01Icon}
          className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
        />
        <Input
          {...NO_AUTOFILL_PROPS}
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
  const { data: session, isPending: isSessionPending, error: sessionError } = useSettledSession();
  const viewerReady = !isSessionPending && !sessionError;
  const userId = session?.user?.id;

  const navActionTarget = useNavActionTarget();
  const showFloatingMobileFilters = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>(loadStoredStatus);
  const [countryCodes, setCountryCodes] = useState(loadStoredCountryCodes);
  const [storedOperatorFilter, setStoredOperatorFilter] = useState(loadStoredOperatorFilter);
  const [searchInput, setSearchInput] = useState("");
  const [openedSubmission, setOpenedSubmission] = useState<OpenedSubmission | null>(null);
  const [isSubmissionSheetOpen, setIsSubmissionSheetOpen] = useState(false);
  const activeSearch = useDebouncedValue(searchInput, 300);

  const { data: operatorData, isError: hasOperatorsError } = useQuery({
    ...operatorsQueryOptions({ viewerId: userId ?? null }),
    enabled: viewerReady,
  });
  const operators = viewerReady ? operatorData : undefined;
  const { data: brands } = useQuery(brandsQueryOptions());
  const filterScope = useListPanelScope(countryCodes, false);
  const operatorById = useMemo(
    () => new Map((operators ?? NO_OPERATORS).map((operator) => [operator.id, toOperatorOption(operator, brands)])),
    [operators, brands],
  );
  const getOperatorById = useCallback(
    (operatorId: number | null) => (operatorId === null ? undefined : operatorById.get(operatorId)),
    [operatorById],
  );
  const { operatorIds: pickedOperatorIds, operatorMncs: legacyOperatorMncs } = storedOperatorFilter;
  const hasLegacyFilter = pickedOperatorIds === null && legacyOperatorMncs.length > 0;
  const migratedOperatorIds = useMemo(
    () => (hasLegacyFilter && operators !== undefined ? findOperatorIdsByMncs(operators, legacyOperatorMncs) : null),
    [hasLegacyFilter, operators, legacyOperatorMncs],
  );
  const storedOperatorIds = pickedOperatorIds ?? migratedOperatorIds ?? NO_OPERATOR_IDS;
  const selectedOperatorIds = useMemo(
    () => filterSubmissionIdsByCountries(storedOperatorIds, operators, countryCodes),
    [storedOperatorIds, operators, countryCodes],
  );
  const isAwaitingOperators = hasLegacyFilter && migratedOperatorIds === null && !hasOperatorsError;

  useEffect(() => {
    if (operators !== undefined && selectedOperatorIds !== pickedOperatorIds) storeOperatorIds(selectedOperatorIds);
  }, [operators, selectedOperatorIds, pickedOperatorIds]);

  const handleStatusChange = useCallback((status: StatusFilter) => {
    setStatusFilter(status);
    storeStatus(status);
  }, []);

  const handleOperatorChange = useCallback((operatorIds: number[]) => {
    setStoredOperatorFilter({ operatorIds, operatorMncs: [] });
    storeOperatorIds(operatorIds);
  }, []);

  const handleCountryChange = useCallback(
    (next: string[]) => {
      setCountryCodes(next);
      storeCountryCodes(next);
      if (hasLegacyFilter && migratedOperatorIds === null) return;
      handleOperatorChange(filterSubmissionIdsByCountries(selectedOperatorIds, operators, next));
    },
    [hasLegacyFilter, migratedOperatorIds, handleOperatorChange, selectedOperatorIds, operators],
  );
  const handleClearFilters = useCallback(() => {
    handleStatusChange("all");
    handleCountryChange([]);
    handleOperatorChange([]);
    setSearchInput("");
  }, [handleStatusChange, handleCountryChange, handleOperatorChange]);

  const filters = useMemo<MySubmissionsFilters>(
    () => ({
      status: statusFilter === "all" ? null : SUBMISSION_STATUSES[statusFilter],
      countryCodes,
      operatorIds: selectedOperatorIds,
      search: activeSearch,
    }),
    [statusFilter, countryCodes, selectedOperatorIds, activeSearch],
  );

  const hasActiveFilters = statusFilter !== "all" || countryCodes.length > 0 || selectedOperatorIds.length > 0 || activeSearch.trim().length > 0;

  const {
    data,
    dataUpdatedAt,
    isLoading,
    error,
    isRefetching,
    isRefetchError,
    isFetchingNextPage,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useMySubmissions(userId, filters, !isAwaitingOperators);

  const deleteMutation = useMutation({
    mutationFn: (submissionId: string) => withdrawSubmission(submissionId),
    onSuccess: (_result, submissionId) => {
      void invalidateSubmissionQueries(queryClient, submissionId);
      toast.success(t("toast.deleted"));
    },
    onError: (error) => showApiError(error),
  });

  const submissions = useMemo<Submission[]>(() => (data === undefined ? [] : listUniqueSubmissions(data.pages)), [data]);
  const totalSubmissionCount = data?.pages[0]?.total ?? submissions.length;
  const hasLoadedSubmissions = submissions.length > 0;
  const showStaleDataWarning = isRefetchError && hasLoadedSubmissions;

  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const { openStationDialog } = useFloatingDialogStack();
  const handleStationClick = useCallback((stationId: number) => openStationDialog(stationId, "internal"), [openStationDialog]);
  const handleSubmissionClick = useCallback(
    (submission: Submission) => {
      void queryClient.prefetchQuery(submissionPhotosQueryOptions(submission.id));
      if (submission.changes.cells.length > 0) void queryClient.prefetchQuery(bandsQueryOptions());
      if (viewerReady && submission.changes.location?.regionId !== undefined)
        void queryClient.prefetchQuery(regionsQueryOptions({ viewerId: userId ?? null }));
      setOpenedSubmission({ submission, listUpdatedAt: dataUpdatedAt });
      setIsSubmissionSheetOpen(true);
    },
    [queryClient, dataUpdatedAt, viewerReady, userId],
  );

  const getSubmissionKey = useCallback((index: number) => submissions.at(index)?.id ?? index, [submissions]);

  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual requires the compiler's automatic bailout
  const virtualizer = useVirtualizer({
    count: submissions.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    getItemKey: getSubmissionKey,
    overscan: 5,
    gap: 8,
  });

  const items = virtualizer.getVirtualItems();
  const hasVirtualItems = items.length > 0;

  const handleScrollRef = useRef<() => void>(null!);
  handleScrollRef.current = () => {
    if (!hasNextPage || isFetchingNextPage || isFetchNextPageError) return;
    const lastItem = items[items.length - 1];
    if (!lastItem) return;
    if (lastItem.index >= submissions.length - 1) void fetchNextPage();
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

  const isListLoading = isLoading || isAwaitingOperators;
  let listContent: ReactNode;
  if (isListLoading) {
    listContent = (
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
    );
  } else if (error !== null && !hasLoadedSubmissions) {
    listContent = <ErrorState className="h-full" onRetry={() => refetch()} isRetrying={isRefetching} />;
  } else if (!hasLoadedSubmissions) {
    listContent = (
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
    );
  } else {
    listContent = (
      <>
        <div
          role="list"
          aria-label={t("nav:items.mySubmissions")}
          aria-busy={isRefetching || isFetchingNextPage}
          style={{
            height: virtualizer.getTotalSize(),
            width: "100%",
            position: "relative",
          }}
        >
          {items.map((virtualItem) => {
            const submission = submissions[virtualItem.index];
            const row = toSubmissionListRow(submission);
            const { reviewer, reviewNote } = submission;
            const hasNotes = reviewNote !== null && reviewNote !== "";
            const hasReview = hasNotes || reviewer !== null;
            const stationId = submission.station?.id ?? null;
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
                <article className="group relative border-b border-border/50">
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    aria-label={t("mySubmissions.openChanges", { stationId: row.siteId ?? t("common:labels.newStation") })}
                    onPointerEnter={() => void loadSubmissionChangesSheet()}
                    onFocus={() => void loadSubmissionChangesSheet()}
                    onClick={() => handleSubmissionClick(submission)}
                    className={cn(
                      "absolute inset-0 z-0 cursor-pointer transition-colors hover:bg-muted/40",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    )}
                  />
                  <div
                    className={cn(
                      "pointer-events-none relative grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 px-3 py-2.5",
                      "md:flex md:gap-3",
                    )}
                  >
                    <div className="col-span-2 col-start-1 row-start-1 min-w-0 md:order-2 md:flex-1">
                      <StationIdentityCell
                        className={stationId === null ? undefined : "pointer-events-auto relative z-10"}
                        stationId={row.siteId}
                        countryCode={row.countryCode}
                        operator={getOperatorById(row.operatorId)}
                        fallback={t("common:labels.newStation")}
                        onStationClick={stationId === null ? undefined : () => handleStationClick(stationId)}
                      />
                    </div>

                    <SubmissionStatusBadge status={row.status} className="col-start-3 row-start-1 justify-self-end md:order-4" />

                    <div className="col-start-1 row-start-2 justify-self-start md:order-1">
                      <SubmissionChangesSummary submission={row} />
                    </div>

                    <time
                      dateTime={submission.createdAt}
                      className={cn(
                        "col-start-2 row-start-2 self-center whitespace-nowrap text-[11px] text-muted-foreground tabular-nums",
                        "md:order-5 md:text-xs",
                      )}
                    >
                      {formatShortDate(submission.createdAt, i18n.language)}
                    </time>

                    <div className="pointer-events-none col-start-3 row-start-2 flex items-center gap-1 justify-self-end md:order-3">
                      {submission.status === "pending" ? (
                        <>
                          <Tooltip>
                            <TooltipTrigger render={<span />}>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="pointer-events-auto relative z-10"
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
                                <AlertDialogTrigger
                                  render={
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      className="pointer-events-auto relative z-10"
                                      aria-label={t("mySubmissions.deleteTooltip")}
                                    />
                                  }
                                >
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
                        </>
                      ) : null}
                      <HugeiconsIcon
                        icon={ArrowRight01Icon}
                        className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </div>
                  </div>

                  {hasReview ? (
                    <div className="pointer-events-none relative px-3 pb-2.5 pt-0">
                      <section aria-labelledby={reviewHeadingId} className="bg-muted/60 rounded-lg px-3 py-2.5 space-y-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <h3 id={reviewHeadingId} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {hasNotes ? t("detail.reviewNotes") : t("table.review")}
                          </h3>
                          {reviewer === null ? null : (
                            <p className="text-[11px] text-muted-foreground">
                              {t("mySubmissions.reviewedBy")}{" "}
                              <UserLink user={reviewer} className="pointer-events-auto relative z-10 font-medium text-foreground">
                                {resolveDisplayName(reviewer)}
                              </UserLink>
                              {reviewer.username && reviewer.name ? <span> (@{reviewer.username})</span> : null}
                            </p>
                          )}
                        </div>
                        {hasNotes ? (
                          <p className="text-sm leading-relaxed text-foreground wrap-break-word whitespace-pre-wrap">{reviewNote}</p>
                        ) : null}
                      </section>
                    </div>
                  ) : null}
                </article>
              </div>
            );
          })}
        </div>

        {isFetchNextPageError ? (
          <InlineError
            size="sm"
            title={t("mySubmissions.loadMoreError")}
            onRetry={() => fetchNextPage()}
            isRetrying={isFetchingNextPage}
            className="mx-1 my-2"
          />
        ) : null}
        {isFetchingNextPage && !isFetchNextPageError ? (
          <div className="flex justify-center py-4">
            <Spinner className="size-4" />
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <div className="shrink-0 space-y-2">
        <div className={cn(showFloatingMobileFilters && "max-md:hidden")}>
          <MySubmissionsDesktopFilters
            statusFilter={statusFilter}
            countryCodes={countryCodes}
            operatorIds={selectedOperatorIds}
            scope={filterScope}
            searchInput={searchInput}
            onStatusChange={handleStatusChange}
            onCountryChange={handleCountryChange}
            onOperatorChange={handleOperatorChange}
            onSearchChange={setSearchInput}
          />
        </div>

        {showStaleDataWarning ? <StaleDataNotice onRetry={() => refetch()} isRetrying={isRefetching} className="flex w-fit" /> : null}
      </div>

      <div ref={setScrollEl} className={cn("flex-1 min-h-0 overflow-y-auto", showFloatingMobileFilters && "max-md:mb-10")}>
        {listContent}
      </div>

      {openedSubmission === null ? null : (
        <Suspense fallback={<SubmissionChangesSheetFallback />}>
          <SubmissionChangesSheet
            submission={openedSubmission.submission}
            listUpdatedAt={openedSubmission.listUpdatedAt}
            operators={operators ?? NO_OPERATORS}
            open={isSubmissionSheetOpen}
            onOpenChange={setIsSubmissionSheetOpen}
          />
        </Suspense>
      )}

      {navActionTarget === null
        ? null
        : createPortal(
            showFloatingMobileFilters ? (
              <div className="max-md:w-[calc(100vw-1.5rem)] max-md:min-w-0 max-md:gap-1">
                <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden md:hidden">
                  <div className="w-max mx-auto">
                    <MySubmissionsMobileFilterRail
                      statusFilter={statusFilter}
                      countryCodes={countryCodes}
                      operatorIds={selectedOperatorIds}
                      scope={filterScope}
                      searchInput={searchInput}
                      onStatusChange={handleStatusChange}
                      onCountryChange={handleCountryChange}
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
