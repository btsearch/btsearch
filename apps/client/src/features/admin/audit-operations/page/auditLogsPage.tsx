import type { AuditOperationSort } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { OperationDetailSheet } from "../components/operationDetailSheet";
import { auditOperationsQueryOptions } from "../queries";
import type { AuditOperation } from "../types";
import { useCountryFilter } from "../useCountryFilter";
import { AuditLogsMobileFilterRail } from "./auditLogsMobileFilterRail";
import {
  AUDIT_LOGS_MAX_PAGE_SIZE,
  type AuditLogsCriteria,
  type AuditLogsFilters,
  getLastAuditLogsPage,
  toAuditOperationsQuery,
} from "./auditLogsSearch";
import { AuditLogsTable } from "./auditLogsTable";
import { type AuditLogsFilterProps, AuditLogsToolbar } from "./auditLogsToolbar";
import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
import { DATA_TABLE_HEADER_HEIGHT, DataTable, getDataTableViewState } from "@/components/ui/data-table";
import { STALE_NOTICE_CORNER_CLASS, StaleDataNotice } from "@/components/ui/error-state";
import { useNavActionTarget } from "@/contexts/navActions";
import { useUserSearchText } from "@/features/admin/users/components/list/useUserSearchText";
import { MobileFilterRailFloating, MobileFilterRailInline } from "@/features/shared/filterPanel";
import { useFittedListPagination } from "@/hooks/useFittedListPagination";
import { cn } from "@/lib/utils";

type AuditLogsPageProps = {
  criteria: AuditLogsCriteria;
  onCriteriaChange: (changes: Partial<AuditLogsCriteria>) => void;
};

const NO_OPERATIONS: AuditOperation[] = [];
const MOBILE_ROW_HEIGHT_FALLBACK = 112;

export function AuditLogsPage({ criteria, onCriteriaChange }: AuditLogsPageProps) {
  const { t } = useTranslation(["admin", "nav"]);
  const navActionTarget = useNavActionTarget();
  const countryFilter = useCountryFilter(criteria.countryCodes);
  const [lastOperationId, setLastOperationId] = useState(criteria.operationId);
  const {
    text: searchText,
    changeText: changeSearchText,
    clearText: clearSearchText,
  } = useUserSearchText(criteria.query, (query) => onCriteriaChange({ query, page: 0 }));
  const paging = useFittedListPagination({
    page: criteria.page,
    chosenPageSize: criteria.pageSize,
    maxPageSize: AUDIT_LOGS_MAX_PAGE_SIZE,
    mobileRowHeightFallback: MOBILE_ROW_HEIGHT_FALLBACK,
    mobileHeaderHeight: DATA_TABLE_HEADER_HEIGHT,
    onPagingChange: onCriteriaChange,
  });
  const {
    isMobile,
    isPageSizeMeasured,
    autoPageSize,
    containerRef,
    pagination: { pageSize },
  } = paging;
  const listQuery = useQuery({
    ...auditOperationsQueryOptions(toAuditOperationsQuery({ ...criteria, countryCodes: countryFilter.selected }, pageSize)),
    enabled: isPageSizeMeasured,
  });
  const operations = listQuery.data?.data ?? NO_OPERATIONS;
  const total = listQuery.data?.paging.total ?? 0;
  const hasRows = operations.length > 0;
  const hasRequestedPage = listQuery.data !== undefined && !listQuery.isPlaceholderData;
  const lastPage = getLastAuditLogsPage(total, pageSize);
  const isPastLastPage = hasRequestedPage && !hasRows && criteria.page > lastPage;

  useEffect(() => {
    if (isPastLastPage) onCriteriaChange({ page: lastPage });
  }, [isPastLastPage, lastPage, onCriteriaChange]);

  if (criteria.operationId !== null && criteria.operationId !== lastOperationId) setLastOperationId(criteria.operationId);
  const sheetOperationId = criteria.operationId ?? lastOperationId;

  const hasFloatingMobileFilters = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const isRefillingPage = total > 0 && listQuery.isFetching;
  const isLoading = !isPageSizeMeasured || listQuery.isLoading || (!hasRows && (listQuery.isPlaceholderData || isPastLastPage || isRefillingPage));
  const viewState = getDataTableViewState(isLoading, listQuery.isError && !hasRows, hasRows);
  const hasStaleRows = listQuery.isError && hasRows;
  const isUpdating = listQuery.isFetching && !isLoading && !listQuery.isError;
  const isTableScrollable = pageSize > autoPageSize || viewState === "error" || viewState === "empty";
  const activeFilterCount = [
    criteria.entities.length > 0,
    criteria.kinds.length > 0,
    criteria.userIds.length > 0,
    countryFilter.selected.length > 0,
    criteria.from !== "",
    criteria.to !== "",
    searchText.trim() !== "",
  ].filter(Boolean).length;

  let scrollClass = isTableScrollable ? "overflow-y-auto" : "overflow-y-clip";
  if (isMobile) scrollClass = "overflow-y-auto overscroll-y-contain";

  let listNotice: ReactNode = null;
  if (hasStaleRows) {
    listNotice = <StaleDataNotice onRetry={listQuery.refetch} isRetrying={listQuery.isFetching} className={STALE_NOTICE_CORNER_CLASS} />;
  } else if (isUpdating) {
    listNotice = <DataTable.UpdatingIndicator className="z-40" />;
  }

  function changeFilters(changes: Partial<AuditLogsFilters>) {
    onCriteriaChange({ ...changes, page: 0 });
  }

  function clearFilters() {
    clearSearchText();
    onCriteriaChange({ query: "", entities: [], kinds: [], userIds: [], countryCodes: [], from: "", to: "", page: 0 });
  }

  function changeSort(sort: AuditOperationSort) {
    onCriteriaChange({ sort, page: 0 });
  }

  function openOperation(operationId: number) {
    onCriteriaChange({ operationId });
  }

  function changeSheetOpen(isOpen: boolean) {
    if (!isOpen) onCriteriaChange({ operationId: null });
  }

  const filterProps: AuditLogsFilterProps = {
    filters: criteria,
    searchText,
    countryFilter,
    activeFilterCount,
    onFiltersChange: changeFilters,
    onSearchTextChange: changeSearchText,
    onClearFilters: clearFilters,
  };
  const mobileFilterRail = isMobile ? <AuditLogsMobileFilterRail {...filterProps} /> : null;

  return (
    <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-3 min-h-0 overflow-hidden">
      <header className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav:items.auditLogs")}</h1>
        <p className="text-muted-foreground text-sm">{t("admin:auditLogs.subtitle")}</p>
      </header>

      {isMobile ? null : <AuditLogsToolbar {...filterProps} />}
      {isMobile && !hasFloatingMobileFilters ? <MobileFilterRailInline>{mobileFilterRail}</MobileFilterRailInline> : null}

      <div
        ref={containerRef}
        className={cn("custom-scrollbar relative min-h-0 flex-1 overflow-x-hidden", scrollClass, hasFloatingMobileFilters && "max-md:mb-10")}
        aria-busy={isLoading || listQuery.isFetching}
      >
        {listNotice}
        <AuditLogsTable
          operations={operations}
          total={total}
          viewState={viewState}
          paging={paging}
          sort={criteria.sort}
          activeFilterCount={activeFilterCount}
          isRetrying={listQuery.isFetching}
          onSortChange={changeSort}
          onOpenOperation={openOperation}
          onClearFilters={clearFilters}
          onRetry={listQuery.refetch}
        />
      </div>

      {sheetOperationId === null ? null : (
        <OperationDetailSheet
          operationId={sheetOperationId}
          listRow={operations.find((operation) => operation.id === sheetOperationId)}
          open={criteria.operationId !== null}
          onOpenChange={changeSheetOpen}
          onOpenOperation={openOperation}
        />
      )}
      {hasFloatingMobileFilters && navActionTarget ? (
        <MobileFilterRailFloating target={navActionTarget}>{mobileFilterRail}</MobileFilterRailFloating>
      ) : null}
    </div>
  );
}
