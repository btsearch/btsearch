import { File01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import type { MeasurementUpload } from "@openbts/shared/contract";
import { useMutation } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { MeasurementsPage } from "../components/measurementsPage";
import { useCursorPages } from "../hooks/useCursorPages";
import { ExcludeUploadDialog } from "./excludeUploadDialog";
import { RestoreUploadDialog } from "./restoreUploadDialog";
import type { UploadRowActions } from "./uploadColumns";
import { type UploadsCriteria, countActiveUploadFilters } from "./uploadsSearch";
import { UploadsTable } from "./uploadsTable";
import { UploadsToolbar } from "./uploadsToolbar";
import { useUploadRows } from "./useUploadRows";
import {
  DATA_TABLE_HEADER_HEIGHT,
  DATA_TABLE_PAGINATION_HEIGHT,
  DATA_TABLE_ROW_HEIGHT,
  DataTable,
  getDataTableViewState,
} from "@/components/ui/data-table";
import { STALE_NOTICE_CORNER_CLASS, StaleDataNotice } from "@/components/ui/error-state";
import type { RecordListEmptyState } from "@/features/admin/reference/components/shared/recordListPrimitives";
import { showUploadError } from "@/features/settings/measurementErrors";
import { downloadMeasurementUploadFile } from "@/features/settings/measurementQueries";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { cn } from "@/lib/utils";

type UploadsPageProps = {
  criteria: UploadsCriteria;
  onCriteriaChange: (changes: Partial<UploadsCriteria>) => void;
};

type UploadDialogState = {
  upload: MeasurementUpload | null;
  open: boolean;
};

const CLOSED_DIALOG: UploadDialogState = { upload: null, open: false };

export function UploadsPage({ criteria, onCriteriaChange }: UploadsPageProps) {
  const { t } = useTranslation(["admin", "settings"]);
  const { containerRef, pagination, setPagination, autoPageSize, pageSizeOptions, isPageSizeMeasured } = useTablePagination({
    rowHeight: DATA_TABLE_ROW_HEIGHT,
    headerHeight: DATA_TABLE_HEADER_HEIGHT,
    paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
    minRows: 1,
  });
  const { pageSize } = pagination;
  const { cursor, pageIndex, goFirst, goPrevious, goNext } = useCursorPages(`${criteria.statuses.join(",")}|${criteria.userId ?? ""}|${pageSize}`);
  const list = useUploadRows(criteria, pageSize, cursor, isPageSizeMeasured);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const [excludeDialog, setExcludeDialog] = useState(CLOSED_DIALOG);
  const [restoreDialog, setRestoreDialog] = useState(CLOSED_DIALOG);
  const downloadMutation = useMutation({ mutationFn: downloadMeasurementUploadFile, onError: showUploadError });

  const hasRows = list.uploads.length > 0;
  const isPastEnd = list.hasRequestedPage && !hasRows && pageIndex > 0;

  useEffect(() => {
    if (isPastEnd) goPrevious();
  }, [isPastEnd, goPrevious]);

  const activeFilterCount = countActiveUploadFilters(criteria);
  const isLoading = !isPageSizeMeasured || list.isLoading || (!hasRows && (list.isPlaceholderData || isPastEnd));
  const viewState = getDataTableViewState(isLoading, list.isError && !hasRows, hasRows);
  const hasStaleRows = list.isError && hasRows;
  const isUpdating = list.isFetching && !isLoading && !list.isError;
  const hasOpenRow = viewState === "ready" && list.uploads.some((upload) => openIds.has(upload.id));
  const isTableScrollable = hasOpenRow || pageSize > autoPageSize || viewState === "error" || viewState === "empty";

  let listNotice: ReactNode = null;
  if (hasStaleRows) listNotice = <StaleDataNotice onRetry={list.refetch} isRetrying={list.isFetching} className={STALE_NOTICE_CORNER_CLASS} />;
  else if (isUpdating) listNotice = <DataTable.UpdatingIndicator className="z-40" />;

  function clearFilters() {
    onCriteriaChange({ statuses: [], userId: null });
  }

  function toggleUpload(uploadId: string) {
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(uploadId)) next.delete(uploadId);
      else next.add(uploadId);
      return next;
    });
  }

  const emptyState: RecordListEmptyState =
    activeFilterCount > 0
      ? {
          icon: Search01Icon,
          title: t("measurements.uploads.emptyFiltered.title"),
          description: t("measurements.uploads.emptyFiltered.description"),
          action: <ClearFiltersButton count={activeFilterCount} onClick={clearFilters} className="cursor-pointer" />,
        }
      : {
          icon: File01Icon,
          title: t("settings:measurements.uploads.empty"),
          description: t("settings:measurements.uploads.emptyDescription"),
        };

  const actions: UploadRowActions = {
    openIds,
    downloadingId: downloadMutation.isPending ? (downloadMutation.variables?.id ?? null) : null,
    onToggle: toggleUpload,
    onDownload: (upload) => downloadMutation.mutate(upload),
    onExclude: (upload) => setExcludeDialog({ upload, open: true }),
    onRestore: (upload) => setRestoreDialog({ upload, open: true }),
  };

  return (
    <MeasurementsPage section="uploads" isScrolling={false}>
      <UploadsToolbar
        criteria={criteria}
        onStatusesChange={(statuses) => onCriteriaChange({ statuses })}
        onPersonClear={() => onCriteriaChange({ userId: null })}
        onClearFilters={clearFilters}
      />
      <div
        ref={containerRef}
        className={cn("custom-scrollbar relative min-h-0 flex-1 overflow-x-hidden", isTableScrollable ? "overflow-y-auto" : "overflow-y-clip")}
        aria-busy={isLoading || list.isFetching}
      >
        {listNotice}
        <UploadsTable
          uploads={list.uploads}
          total={list.total}
          viewState={viewState}
          paging={{
            pageIndex,
            pageSize,
            autoPageSize,
            pageSizeOptions,
            hasNextPage: list.hasRequestedPage && list.nextCursor !== null,
            onPageSizeChange: (nextPageSize) => setPagination({ pageIndex: 0, pageSize: nextPageSize }),
            onFirstPage: goFirst,
            onPreviousPage: goPrevious,
            onNextPage: () => {
              if (list.nextCursor !== null) goNext(list.nextCursor);
            },
          }}
          actions={actions}
          emptyState={emptyState}
          isRetrying={list.isFetching}
          onRetry={list.refetch}
        />
      </div>
      <ExcludeUploadDialog
        upload={excludeDialog.upload}
        open={excludeDialog.open}
        onOpenChange={(open) => setExcludeDialog((current) => ({ ...current, open }))}
      />
      <RestoreUploadDialog
        upload={restoreDialog.upload}
        open={restoreDialog.open}
        onOpenChange={(open) => setRestoreDialog((current) => ({ ...current, open }))}
      />
    </MeasurementsPage>
  );
}
