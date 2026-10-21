import { PaintBoardIcon } from "@hugeicons/core-free-icons";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Brand } from "../../types";
import { AddRecordButton, type RecordListEmptyState } from "../shared/recordListPrimitives";
import { ReferenceListPage } from "../shared/referenceListPage";
import { type ReferenceListPaging, useReferenceListPage } from "../shared/referenceListPaging";
import { BrandDeleteDialog } from "./brandDeleteDialog";
import { BrandDialog } from "./brandDialog";
import { BrandListTable } from "./brandListTable";
import { useBrandListRows } from "./useBrandListRows";
import { DATA_TABLE_ROW_HEIGHT, DataTable, getDataTableViewState } from "@/components/ui/data-table";
import { STALE_NOTICE_CORNER_CLASS, StaleDataNotice } from "@/components/ui/error-state";

type BrandListPageProps = {
  criteria: ReferenceListPaging;
  onCriteriaChange: (changes: Partial<ReferenceListPaging>) => void;
};

export function BrandListPage({ criteria, onCriteriaChange }: BrandListPageProps) {
  const { t } = useTranslation("admin");
  const list = useBrandListRows();
  const [editedBrand, setEditedBrand] = useState<Brand>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [brandToDelete, setBrandToDelete] = useState<Brand | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const isLoading = !list.hasBrands && !list.isError;
  const viewState = getDataTableViewState(isLoading, list.isError && !list.hasBrands, list.rows.length > 0);
  const listPage = useReferenceListPage({ rows: list.rows, viewState, criteria, rowHeight: DATA_TABLE_ROW_HEIGHT, onCriteriaChange });
  const hasStaleRows = list.isError && list.hasBrands;
  const isUpdating = list.isFetching && !isLoading && !list.isError;
  const deletedRow = brandToDelete === null ? undefined : list.rows.find((row) => row.brand.id === brandToDelete.id);
  const addLabel = t("reference.brands.add");

  function openAddDialog() {
    setEditedBrand(undefined);
    setIsDialogOpen(true);
  }

  function openEditDialog(brand: Brand) {
    setEditedBrand(brand);
    setIsDialogOpen(true);
  }

  function openDeleteDialog(brand: Brand) {
    setIsDialogOpen(false);
    setBrandToDelete(brand);
    setIsDeleteDialogOpen(true);
  }

  const emptyState: RecordListEmptyState = {
    icon: PaintBoardIcon,
    title: t("reference.brands.list.empty.title"),
    description: t("reference.brands.list.empty.description"),
    action: <AddRecordButton label={addLabel} onClick={openAddDialog} />,
  };

  let notice: ReactNode = null;
  if (hasStaleRows) {
    notice = <StaleDataNotice onRetry={list.refetch} isRetrying={list.isFetching} className={STALE_NOTICE_CORNER_CLASS} />;
  } else if (list.hasUsageLoadFailed && viewState === "ready") {
    notice = (
      <StaleDataNotice
        message={t("reference.brands.list.usageLoadFailed")}
        onRetry={list.retryUsage}
        isRetrying={list.isRetryingUsage}
        className={STALE_NOTICE_CORNER_CLASS}
      />
    );
  } else if (isUpdating) {
    notice = <DataTable.UpdatingIndicator className="z-40" />;
  }

  return (
    <>
      <ReferenceListPage
        title={t("nav:items.brands")}
        description={t("reference.brands.description")}
        action={<AddRecordButton label={addLabel} isCompactOnPhones onClick={openAddDialog} />}
        pager={listPage.pager}
        notice={notice}
        isBusy={isLoading || list.isFetching}
      >
        <BrandListTable
          rows={listPage.pageRows}
          isFilled={listPage.isFilled}
          mobileListRef={listPage.mobileListRef}
          skeletonRowCount={listPage.skeletonRowCount}
          viewState={viewState}
          emptyState={emptyState}
          isRetrying={list.isFetching}
          onRetry={list.refetch}
          onEdit={openEditDialog}
          onDelete={openDeleteDialog}
        />
      </ReferenceListPage>
      <BrandDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} brand={editedBrand} onDelete={openDeleteDialog} />
      {brandToDelete === null ? null : (
        <BrandDeleteDialog
          brand={brandToDelete}
          operators={deletedRow?.operators}
          owners={deletedRow?.owners}
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        />
      )}
    </>
  );
}
