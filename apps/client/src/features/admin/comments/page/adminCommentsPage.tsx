import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Comment } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { DeleteCommentDialog } from "../components/deleteCommentDialog";
import { useCommentModeration } from "../mutations";
import { moderatedCommentsQueryOptions, pendingCommentCountQueryOptions } from "../queries";
import { type AdminCommentActions, AdminCommentActionsContext } from "./adminCommentActions";
import type { AdminCommentsFilterProps } from "./adminCommentsFilters";
import { AdminCommentSheet } from "./adminCommentSheet";
import { AdminCommentsMobileFilterRail } from "./adminCommentsMobileFilterRail";
import { AdminCommentsTable } from "./adminCommentsTable";
import { AdminCommentsQueueSwitch, AdminCommentsToolbar } from "./adminCommentsToolbar";
import { ADMIN_COMMENTS_MAX_LIMIT, type AdminCommentsCriteria, getLastAdminCommentsPage, toModeratedCommentsQuery } from "./commentsSearch";
import { useCommentsArea } from "./useCommentsArea";
import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
import { DataTable, getDataTableViewState } from "@/components/ui/data-table";
import { STALE_NOTICE_CORNER_CLASS, StaleDataNotice } from "@/components/ui/error-state";
import { useNavActionTarget } from "@/contexts/navActions";
import { useUserSearchText } from "@/features/admin/users/components/list/useUserSearchText";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { useMapLookups } from "@/features/map/data/mapLookups";
import { MobileFilterRailFloating, MobileFilterRailInline } from "@/features/shared/filterPanel";
import { useFittedListPagination } from "@/hooks/useFittedListPagination";
import { useSettings } from "@/hooks/useSettings";
import { cn } from "@/lib/utils";

type AdminCommentsPageProps = {
  criteria: AdminCommentsCriteria;
  onCriteriaChange: (changes: Partial<AdminCommentsCriteria>) => void;
};

type SheetTarget = {
  commentId: string | null;
  isOpen: boolean;
  startsEditing: boolean;
};

const MOBILE_PAGE_SIZE = 20;
const NO_COMMENTS: Comment[] = [];
const CLOSED_SHEET: SheetTarget = { commentId: null, isOpen: false, startsEditing: false };

export function AdminCommentsPage({ criteria, onCriteriaChange }: AdminCommentsPageProps) {
  const { t } = useTranslation(["admin", "nav"]);
  const navActionTarget = useNavActionTarget();
  const { openStationDialog } = useFloatingDialogStack();
  const settingsQuery = useSettings();
  const { lookups, isError: haveLookupsFailed } = useMapLookups();
  const area = useCommentsArea(lookups, haveLookupsFailed);
  const moderation = useCommentModeration();
  const [sheetTarget, setSheetTarget] = useState(CLOSED_SHEET);
  const [sheetComment, setSheetComment] = useState<Comment | null>(null);
  const [commentToDelete, setCommentToDelete] = useState<Comment | null>(null);
  const [lastPendingCount, setLastPendingCount] = useState<number>();
  const {
    text: searchText,
    changeText: changeSearchText,
    clearText: clearSearchText,
  } = useUserSearchText(criteria.query, (query) => onCriteriaChange({ query, page: 0 }));
  const paging = useFittedListPagination({
    page: criteria.page,
    chosenPageSize: criteria.pageSize,
    maxPageSize: ADMIN_COMMENTS_MAX_LIMIT,
    mobilePageSize: MOBILE_PAGE_SIZE,
    onPagingChange: onCriteriaChange,
  });
  const {
    isMobile,
    isPageSizeMeasured,
    autoPageSize,
    containerRef,
    pagination: { pageSize },
  } = paging;
  const listQuery = useQuery({ ...moderatedCommentsQueryOptions(toModeratedCommentsQuery(criteria, pageSize)), enabled: isPageSizeMeasured });
  const isWholePendingQueue = criteria.queue === "pending" && criteria.authorIds.length === 0 && criteria.query === "";
  const pendingCountQuery = useQuery({ ...pendingCommentCountQueryOptions(), enabled: !isWholePendingQueue });
  const comments = listQuery.data?.comments ?? NO_COMMENTS;
  const total = listQuery.data?.total ?? 0;
  const hasRows = comments.length > 0;
  const hasRequestedPage = listQuery.data !== undefined && !listQuery.isPlaceholderData;
  const lastPage = getLastAdminCommentsPage(total, pageSize);
  const isPastLastPage = hasRequestedPage && !hasRows && criteria.page > lastPage;

  useEffect(() => {
    if (isPastLastPage) onCriteriaChange({ page: lastPage });
  }, [isPastLastPage, lastPage, onCriteriaChange]);

  const listedSheetComment = comments.find((comment) => comment.id === sheetTarget.commentId);
  if (listedSheetComment !== undefined && listedSheetComment !== sheetComment) setSheetComment(listedSheetComment);

  const listedPendingCount = hasRequestedPage ? total : undefined;
  const countedPendingCount = pendingCountQuery.isFetching ? undefined : pendingCountQuery.data;
  const loadedPendingCount = isWholePendingQueue ? listedPendingCount : countedPendingCount;
  if (loadedPendingCount !== undefined && loadedPendingCount !== lastPendingCount) setLastPendingCount(loadedPendingCount);
  const pendingCount = loadedPendingCount ?? lastPendingCount;

  const hasFloatingMobileFilters = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const isRefillingPage = total > 0 && listQuery.isFetching;
  const isLoading = !isPageSizeMeasured || listQuery.isLoading || (!hasRows && (listQuery.isPlaceholderData || isPastLastPage || isRefillingPage));
  const viewState = getDataTableViewState(isLoading, listQuery.isError && !hasRows, hasRows);
  const hasStaleRows = listQuery.isError && hasRows;
  const isUpdating = listQuery.isFetching && !isLoading && !listQuery.isError;
  const isTableScrollable = pageSize > autoPageSize || viewState === "error" || viewState === "empty";
  const activeFilterCount = Number(searchText.trim() !== "") + Number(criteria.authorIds.length > 0);
  const isReviewOff = settingsQuery.data?.features.commentReview === false;

  let scrollClass = isTableScrollable ? "overflow-y-auto" : "overflow-y-clip";
  if (isMobile) scrollClass = "overflow-y-auto overscroll-y-contain";

  let listNotice: ReactNode = null;
  if (hasStaleRows) {
    listNotice = <StaleDataNotice onRetry={listQuery.refetch} isRetrying={listQuery.isFetching} className={STALE_NOTICE_CORNER_CLASS} />;
  } else if (isUpdating) {
    listNotice = <DataTable.UpdatingIndicator className="z-40" />;
  }

  function clearFilters() {
    clearSearchText();
    onCriteriaChange({ query: "", authorIds: [], page: 0 });
  }

  function showComment(comment: Comment, startsEditing: boolean) {
    setSheetComment(comment);
    setSheetTarget({ commentId: comment.id, isOpen: true, startsEditing });
  }

  function closeSheet() {
    setSheetTarget((current) => ({ ...current, isOpen: false }));
    setCommentToDelete(null);
  }

  function changeSheetOpen(isOpen: boolean) {
    if (!isOpen) closeSheet();
  }

  function keepSheetChange(changed: Comment) {
    setSheetComment((current) => (current !== null && current.id === changed.id ? { ...current, ...changed } : current));
  }

  function approveComment(comment: Comment) {
    moderation.approve(comment, { onSuccess: keepSheetChange });
  }

  function sendCommentBack(comment: Comment) {
    moderation.sendBack(comment, { onSuccess: keepSheetChange });
  }

  function saveCommentText(comment: Comment, content: string, onSaved: () => void) {
    moderation.edit(comment, content, {
      onSuccess: (edited) => {
        keepSheetChange(edited);
        onSaved();
      },
    });
  }

  function removeComment(comment: Comment) {
    moderation.remove(comment, {
      onSuccess: () => setSheetTarget((current) => (current.commentId === comment.id ? { ...current, isOpen: false } : current)),
    });
  }

  function openCommentStation(comment: Comment) {
    closeSheet();
    openStationDialog(comment.stationId, "internal", comment.station?.locationId ?? undefined);
  }

  const commentActions: AdminCommentActions = {
    lookups,
    pendingWrite: moderation.pendingWrite,
    sort: criteria.sort,
    onSortChange: (sort) => onCriteriaChange({ sort, page: 0 }),
    onOpen: (comment) => showComment(comment, false),
    onApprove: approveComment,
    onSendBack: sendCommentBack,
    onEdit: (comment) => showComment(comment, true),
    onDelete: setCommentToDelete,
  };
  const filterProps: AdminCommentsFilterProps = {
    queue: criteria.queue,
    pendingCount,
    searchText,
    authorIds: criteria.authorIds,
    activeFilterCount,
    onQueueChange: (queue) => onCriteriaChange({ queue, page: 0 }),
    onSearchTextChange: changeSearchText,
    onAuthorIdsChange: (authorIds) => onCriteriaChange({ authorIds, page: 0 }),
    onClearFilters: clearFilters,
  };
  const mobileFilterRail = isMobile ? <AdminCommentsMobileFilterRail {...filterProps} /> : null;

  return (
    <AdminCommentActionsContext.Provider value={commentActions}>
      <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 gap-3 min-h-0 overflow-hidden">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{t("nav:items.comments")}</h1>
            <p className="mt-1 text-sm text-muted-foreground max-md:hidden">
              {t("admin:comments.description")}
              {area === null ? null : (
                <>
                  <span aria-hidden="true" className="mx-1.5">
                    ·
                  </span>
                  <span>{area}</span>
                </>
              )}
            </p>
          </div>
          {isMobile ? null : (
            <AdminCommentsQueueSwitch queue={filterProps.queue} pendingCount={pendingCount} onQueueChange={filterProps.onQueueChange} />
          )}
        </header>

        {isMobile ? null : (
          <AdminCommentsToolbar
            searchText={searchText}
            authorIds={filterProps.authorIds}
            activeFilterCount={activeFilterCount}
            onSearchTextChange={changeSearchText}
            onAuthorIdsChange={filterProps.onAuthorIdsChange}
            onClearFilters={clearFilters}
          />
        )}
        {isMobile && !hasFloatingMobileFilters ? <MobileFilterRailInline>{mobileFilterRail}</MobileFilterRailInline> : null}

        {isReviewOff ? (
          <p role="status" className="flex shrink-0 items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            <HugeiconsIcon icon={InformationCircleIcon} aria-hidden="true" className="size-3.5 shrink-0" />
            <span>{t("admin:comments.reviewOff")}</span>
          </p>
        ) : null}

        <div
          ref={containerRef}
          className={cn("custom-scrollbar relative min-h-0 flex-1 overflow-x-hidden", scrollClass, hasFloatingMobileFilters && "max-md:mb-10")}
          aria-busy={isLoading || listQuery.isFetching}
        >
          {listNotice}
          <AdminCommentsTable
            comments={comments}
            total={total}
            viewState={viewState}
            paging={paging}
            queue={criteria.queue}
            activeFilterCount={activeFilterCount}
            isRetrying={listQuery.isFetching}
            onClearFilters={clearFilters}
            onRetry={listQuery.refetch}
          />
        </div>

        {hasFloatingMobileFilters && navActionTarget ? (
          <MobileFilterRailFloating target={navActionTarget}>{mobileFilterRail}</MobileFilterRailFloating>
        ) : null}
      </div>

      <AdminCommentSheet
        comment={sheetComment}
        open={sheetTarget.isOpen}
        startsEditing={sheetTarget.startsEditing}
        isMobile={isMobile}
        onOpenChange={changeSheetOpen}
        onSaveText={saveCommentText}
        onStationOpen={openCommentStation}
      />
      <DeleteCommentDialog comment={commentToDelete} onConfirm={removeComment} onClose={() => setCommentToDelete(null)} />
    </AdminCommentActionsContext.Provider>
  );
}
