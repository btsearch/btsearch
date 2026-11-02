import { UserAdd01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { CreateUserDialog } from "../create/createUserDialog";
import type { UserListCriteria } from "./userListCriteria";
import type { UserListFilterProps } from "./userListFilters";
import { UserListMobileFilterRail } from "./userListMobileFilterRail";
import { UserListTable } from "./userListTable";
import { UserListToolbar } from "./userListToolbar";
import { useUserListPagination } from "./useUserListPagination";
import { useUserListRows } from "./useUserListRows";
import { useUserSearchText } from "./useUserSearchText";
import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
import { Button } from "@/components/ui/button";
import { DataTable, getDataTableViewState } from "@/components/ui/data-table";
import { STALE_NOTICE_CORNER_CLASS, StaleDataNotice } from "@/components/ui/error-state";
import { useNavActionTarget } from "@/contexts/navActions";
import { MobileFilterRailFloating, MobileFilterRailInline } from "@/features/shared/filterPanel";
import { cn } from "@/lib/utils";

type UserListPageProps = {
  criteria: UserListCriteria;
  onCriteriaChange: (changes: Partial<UserListCriteria>) => void;
};

export function UserListPage({ criteria, onCriteriaChange }: UserListPageProps) {
  const { t } = useTranslation(["admin", "nav"]);
  const navigate = useNavigate();
  const navActionTarget = useNavActionTarget();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const {
    text: searchText,
    changeText: changeSearchText,
    clearText: clearSearchText,
  } = useUserSearchText(criteria.query, (query) => onCriteriaChange({ query, page: 0 }));
  const paging = useUserListPagination(criteria.page, (page) => onCriteriaChange({ page }));
  const {
    isMobile,
    isPageSizeMeasured,
    autoPageSize,
    containerRef,
    pagination: { pageSize },
  } = paging;
  const list = useUserListRows(criteria, pageSize, isPageSizeMeasured);
  const hasRows = list.rows.length > 0;
  const lastPageIndex = Math.max(0, Math.ceil(list.total / pageSize) - 1);
  const isPastLastPage = list.hasRequestedPage && !hasRows && criteria.page > lastPageIndex;

  useEffect(() => {
    if (isPastLastPage) onCriteriaChange({ page: lastPageIndex });
  }, [isPastLastPage, lastPageIndex, onCriteriaChange]);

  const hasFloatingMobileFilters = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const isLoading = !isPageSizeMeasured || list.isLoading || (!hasRows && (list.isPlaceholderData || isPastLastPage));
  const viewState = getDataTableViewState(isLoading, list.isError && !hasRows, hasRows);
  const hasStaleRows = list.isError && hasRows;
  const isUpdating = list.isFetching && !isLoading && !list.isError;
  const isTableScrollable = pageSize > autoPageSize || viewState === "error" || viewState === "empty";
  const activeFilterCount = Number(searchText.trim() !== "") + Number(criteria.roles.length > 0) + Number(criteria.status !== "all");

  let scrollClass = isTableScrollable ? "overflow-y-auto" : "overflow-y-clip";
  if (isMobile) scrollClass = "overflow-y-auto overscroll-y-contain";

  let listNotice: ReactNode = null;
  if (hasStaleRows) {
    listNotice = <StaleDataNotice onRetry={list.refetch} isRetrying={list.isFetching} className={STALE_NOTICE_CORNER_CLASS} />;
  } else if (list.haveGrantChipsFailed) {
    listNotice = (
      <StaleDataNotice
        message={t("users.detail.grants.loadFailed")}
        onRetry={list.retryGrantChips}
        isRetrying={list.isRetryingGrantChips}
        className={STALE_NOTICE_CORNER_CLASS}
      />
    );
  } else if (isUpdating) {
    listNotice = <DataTable.UpdatingIndicator className="z-40" />;
  }

  function clearFilters() {
    clearSearchText();
    onCriteriaChange({ query: "", roles: [], status: "all", page: 0 });
  }

  function openUser(userId: string) {
    void navigate({ to: "/admin/users/$id", params: { id: userId } });
  }

  const filterProps: UserListFilterProps = {
    searchText,
    roles: criteria.roles,
    status: criteria.status,
    activeFilterCount,
    onSearchTextChange: changeSearchText,
    onRolesChange: (roles) => onCriteriaChange({ roles, page: 0 }),
    onStatusChange: (status) => onCriteriaChange({ status, page: 0 }),
    onClearFilters: clearFilters,
  };
  const mobileFilterRail = isMobile ? <UserListMobileFilterRail {...filterProps} /> : null;

  return (
    <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-3 min-h-0 overflow-hidden">
      <header className="flex shrink-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t("nav:items.users")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground max-md:hidden">{t("users.list.description")}</p>
        </div>
        <Button type="button" variant="outline" className="shrink-0 cursor-pointer" onClick={() => setIsCreateOpen(true)}>
          <HugeiconsIcon icon={UserAdd01Icon} data-icon="inline-start" aria-hidden="true" />
          {t("users.create.button")}
        </Button>
      </header>
      <CreateUserDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />

      {isMobile ? null : <UserListToolbar {...filterProps} />}
      {isMobile && !hasFloatingMobileFilters ? <MobileFilterRailInline>{mobileFilterRail}</MobileFilterRailInline> : null}

      <div
        ref={containerRef}
        className={cn("custom-scrollbar relative min-h-0 flex-1 overflow-x-hidden", scrollClass, hasFloatingMobileFilters && "max-md:mb-10")}
        aria-busy={isLoading || list.isFetching}
      >
        {listNotice}
        <UserListTable
          rows={list.rows}
          total={list.total}
          viewState={viewState}
          paging={paging}
          sort={criteria.sort}
          activeFilterCount={activeFilterCount}
          isRetrying={list.isFetching}
          onSortChange={(sort) => onCriteriaChange({ sort, page: 0 })}
          onClearFilters={clearFilters}
          onRetry={list.refetch}
          onOpenUser={openUser}
        />
      </div>

      {hasFloatingMobileFilters && navActionTarget ? (
        <MobileFilterRailFloating target={navActionTarget}>{mobileFilterRail}</MobileFilterRailFloating>
      ) : null}
    </div>
  );
}
