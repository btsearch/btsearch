import { ArrowUpRight01Icon, TaskDaily01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { List } from "@openbts/shared/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { adminListsQueryOptions, refreshChangedListQueries } from "../api";
import { ADMIN_LISTS_MAX_LIMIT, type AdminListsCriteria, getLastAdminListsPage, toAdminListsParams } from "../listsSearch";
import { type AdminListActions, AdminListActionsContext } from "./adminListActions";
import { AdminListDeleteDialog } from "./adminListDeleteDialog";
import { AdminListEditDialog } from "./adminListEditDialog";
import type { AdminListsFilterProps } from "./adminListsFilters";
import { AdminListsMobileFilterRail } from "./adminListsMobileFilterRail";
import { AdminListsTable } from "./adminListsTable";
import { AdminListsToolbar } from "./adminListsToolbar";
import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
import { buttonVariants } from "@/components/ui/button";
import { DataTable, getDataTableViewState } from "@/components/ui/data-table";
import { ErrorState, STALE_NOTICE_CORNER_CLASS, StaleDataNotice } from "@/components/ui/error-state";
import { useNavActionTarget } from "@/contexts/navActions";
import { useUserSearchText } from "@/features/admin/users/components/list/useUserSearchText";
import { updateList } from "@/features/lists/api";
import { MobileFilterRailFloating, MobileFilterRailInline } from "@/features/shared/filterPanel";
import { useFittedListPagination } from "@/hooks/useFittedListPagination";
import { useSettings } from "@/hooks/useSettings";
import { showApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

type AdminListsPageProps = {
  criteria: AdminListsCriteria;
  onCriteriaChange: (changes: Partial<AdminListsCriteria>) => void;
};

type AdminListsContentProps = AdminListsPageProps & {
  canRequestLists: boolean;
};

const MOBILE_ROW_HEIGHT_FALLBACK = 113;
const NO_LISTS: List[] = [];

function AdminListsOffState() {
  const { t } = useTranslation(["admin", "nav"]);

  return (
    <ErrorState
      tone="neutral"
      icon={TaskDaily01Icon}
      className="min-h-80 shrink-0"
      title={t("admin:lists.off.title")}
      description={t("admin:lists.off.description")}
      action={
        <Link to="/admin/settings" className={buttonVariants({ variant: "outline", size: "sm" })}>
          {t("nav:items.systemSettings")}
          <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-end" aria-hidden="true" />
        </Link>
      }
    />
  );
}

function AdminListActionsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("lists");
  const queryClient = useQueryClient();
  const [editedList, setEditedList] = useState<List | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [deletedList, setDeletedList] = useState<List | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const visibilityMutation = useMutation({
    mutationFn: (list: List) => updateList(list.id, { isPublic: !list.isPublic }),
    onSuccess: (_updatedList, list) => {
      void refreshChangedListQueries(queryClient, list.id);
      toast.success(t("lists:updated"));
    },
    onError: showApiError,
  });

  const listActions: AdminListActions = {
    pendingListId: visibilityMutation.isPending ? (visibilityMutation.variables?.id ?? null) : null,
    onEdit: (list) => {
      setEditedList(list);
      setIsEditOpen(true);
    },
    onVisibilityToggle: visibilityMutation.mutate,
    onDelete: (list) => {
      setDeletedList(list);
      setIsDeleteOpen(true);
    },
  };

  return (
    <>
      <AdminListActionsContext.Provider value={listActions}>{children}</AdminListActionsContext.Provider>
      {editedList === null ? null : <AdminListEditDialog list={editedList} open={isEditOpen} onOpenChange={setIsEditOpen} />}
      {deletedList === null ? null : <AdminListDeleteDialog list={deletedList} open={isDeleteOpen} onOpenChange={setIsDeleteOpen} />}
    </>
  );
}

function AdminListsContent({ criteria, canRequestLists, onCriteriaChange }: AdminListsContentProps) {
  const navigate = useNavigate();
  const navActionTarget = useNavActionTarget();
  const {
    text: searchText,
    changeText: changeSearchText,
    clearText: clearSearchText,
  } = useUserSearchText(criteria.query, (query) => onCriteriaChange({ query, page: 0 }));
  const paging = useFittedListPagination({
    page: criteria.page,
    chosenPageSize: criteria.pageSize,
    maxPageSize: ADMIN_LISTS_MAX_LIMIT,
    mobileRowHeightFallback: MOBILE_ROW_HEIGHT_FALLBACK,
    onPagingChange: onCriteriaChange,
  });
  const {
    isMobile,
    isPageSizeMeasured,
    autoPageSize,
    containerRef,
    pagination: { pageSize },
  } = paging;
  const canRequestPage = canRequestLists && isPageSizeMeasured;
  const listsQuery = useQuery({ ...adminListsQueryOptions(toAdminListsParams(criteria, pageSize)), enabled: canRequestPage });
  const lists = listsQuery.data?.lists ?? NO_LISTS;
  const total = listsQuery.data?.total ?? 0;
  const hasRows = lists.length > 0;
  const hasRequestedPage = listsQuery.data !== undefined && !listsQuery.isPlaceholderData;
  const lastPage = getLastAdminListsPage(total, pageSize);
  const isPastLastPage = hasRequestedPage && !hasRows && criteria.page > lastPage;

  useEffect(() => {
    if (isPastLastPage) onCriteriaChange({ page: lastPage });
  }, [isPastLastPage, lastPage, onCriteriaChange]);

  const hasFloatingMobileFilters = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const isLoading = !canRequestPage || listsQuery.isLoading || (!hasRows && (listsQuery.isPlaceholderData || isPastLastPage));
  const viewState = getDataTableViewState(isLoading, listsQuery.isError && !hasRows, hasRows);
  const hasStaleRows = listsQuery.isError && hasRows;
  const isUpdating = listsQuery.isFetching && !isLoading && !listsQuery.isError;
  const isTableScrollable = pageSize > autoPageSize || viewState === "error" || viewState === "empty";
  const activeFilterCount = Number(searchText.trim() !== "") + Number(criteria.visibility !== "all") + Number(criteria.ownerIds.length > 0);

  function clearFilters() {
    clearSearchText();
    onCriteriaChange({ query: "", visibility: "all", ownerIds: [], page: 0 });
  }

  function openList(list: List) {
    void navigate({ to: "/lists/$uuid", params: { uuid: list.id } });
  }

  const filterProps: AdminListsFilterProps = {
    searchText,
    visibility: criteria.visibility,
    ownerIds: criteria.ownerIds,
    activeFilterCount,
    onSearchTextChange: changeSearchText,
    onVisibilityChange: (visibility) => onCriteriaChange({ visibility, page: 0 }),
    onOwnerIdsChange: (ownerIds) => onCriteriaChange({ ownerIds, page: 0 }),
    onClearFilters: clearFilters,
  };
  const mobileFilterRail = isMobile ? <AdminListsMobileFilterRail {...filterProps} /> : null;

  return (
    <>
      {isMobile ? null : <AdminListsToolbar {...filterProps} />}
      {isMobile && !hasFloatingMobileFilters ? <MobileFilterRailInline>{mobileFilterRail}</MobileFilterRailInline> : null}

      <div
        ref={containerRef}
        className={cn(
          "custom-scrollbar relative min-h-0 flex-1 overflow-x-hidden",
          isMobile || isTableScrollable ? "overflow-y-auto" : "overflow-y-clip",
          isMobile && "overscroll-y-contain",
          hasFloatingMobileFilters && "max-md:mb-10",
        )}
        aria-busy={isLoading || listsQuery.isFetching}
      >
        {hasStaleRows ? (
          <StaleDataNotice onRetry={listsQuery.refetch} isRetrying={listsQuery.isFetching} className={STALE_NOTICE_CORNER_CLASS} />
        ) : null}
        {isUpdating ? <DataTable.UpdatingIndicator className="z-40" /> : null}
        <AdminListActionsProvider>
          <AdminListsTable
            lists={lists}
            total={total}
            viewState={viewState}
            paging={paging}
            activeFilterCount={activeFilterCount}
            isRetrying={listsQuery.isFetching}
            onClearFilters={clearFilters}
            onRetry={listsQuery.refetch}
            onOpenList={openList}
          />
        </AdminListActionsProvider>
      </div>

      {hasFloatingMobileFilters && navActionTarget ? (
        <MobileFilterRailFloating target={navActionTarget}>{mobileFilterRail}</MobileFilterRailFloating>
      ) : null}
    </>
  );
}

export function AdminListsPage({ criteria, onCriteriaChange }: AdminListsPageProps) {
  const { t } = useTranslation(["admin", "nav"]);
  const settingsQuery = useSettings();
  const areListsOff = settingsQuery.data?.features.lists === false;

  return (
    <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-3 min-h-0 overflow-hidden">
      <header className="shrink-0">
        <h1 className="text-2xl font-bold tracking-tight">{t("nav:items.lists")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground max-md:hidden">{t("admin:lists.description")}</p>
      </header>

      {areListsOff ? (
        <AdminListsOffState />
      ) : (
        <AdminListsContent
          criteria={criteria}
          canRequestLists={settingsQuery.data !== undefined || settingsQuery.isError}
          onCriteriaChange={onCriteriaChange}
        />
      )}
    </div>
  );
}
