import { Radio01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Band } from "../../types";
import { AddRecordButton, type RecordListEmptyState } from "../shared/recordListPrimitives";
import { ReferenceListPage } from "../shared/referenceListPage";
import { BandDeleteDialog } from "./bandDeleteDialog";
import { BandDialog } from "./bandDialog";
import type { BandListCriteria } from "./bandListCriteria";
import { type BandListFilterProps, BandListMobileFilters, BandListToolbar } from "./bandListFilters";
import { BandListTable } from "./bandListTable";
import { useBandListRows } from "./useBandListRows";
import { DataTable, getDataTableViewState } from "@/components/ui/data-table";
import { STALE_NOTICE_CORNER_CLASS, StaleDataNotice } from "@/components/ui/error-state";
import { useUserSearchText } from "@/features/admin/users/components/list/useUserSearchText";
import { ClearFiltersButton } from "@/features/shared/filterPanel";

type BandListPageProps = {
  criteria: BandListCriteria;
  onCriteriaChange: (changes: Partial<BandListCriteria>) => void;
};

export function BandListPage({ criteria, onCriteriaChange }: BandListPageProps) {
  const { t } = useTranslation(["admin", "nav", "common"]);
  const {
    text: searchText,
    changeText: changeSearchText,
    clearText: clearSearchText,
  } = useUserSearchText(criteria.query, (query) => onCriteriaChange({ query }));
  const list = useBandListRows(criteria, searchText);
  const [editedBand, setEditedBand] = useState<Band | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [bandToDelete, setBandToDelete] = useState<Band | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const bandCount = list.bands.length;
  const hasBands = bandCount > 0;
  const activeFilterCount = Number(searchText.trim() !== "") + Number(criteria.groups.length > 0) + Number(criteria.codePresence !== "all");
  const viewState = getDataTableViewState(list.isLoading, list.isError && !hasBands, list.rows.length > 0);
  const hasStaleRows = list.isError && hasBands;
  const isUpdating = list.isFetching && !list.isLoading && !list.isError;

  function openAddDialog() {
    setEditedBand(null);
    setIsDialogOpen(true);
  }

  function openEditDialog(band: Band) {
    setEditedBand(band);
    setIsDialogOpen(true);
  }

  function openDeleteDialog(band: Band) {
    setBandToDelete(band);
    setIsDeleteDialogOpen(true);
  }

  function clearFilters() {
    clearSearchText();
    onCriteriaChange({ query: "", groups: [], codePresence: "all" });
  }

  const filterProps: BandListFilterProps = {
    searchText,
    groups: criteria.groups,
    codePresence: criteria.codePresence,
    activeFilterCount,
    onSearchTextChange: changeSearchText,
    onGroupsChange: (groups) => onCriteriaChange({ groups }),
    onCodePresenceChange: (codePresence) => onCriteriaChange({ codePresence }),
    onClearFilters: clearFilters,
  };
  const emptyState: RecordListEmptyState =
    activeFilterCount > 0
      ? {
          icon: Search01Icon,
          title: t("admin:reference.bands.list.noMatches"),
          description: t("admin:users.list.empty.description"),
          action: <ClearFiltersButton count={activeFilterCount} onClick={clearFilters} className="cursor-pointer" />,
        }
      : {
          icon: Radio01Icon,
          title: t("admin:reference.bands.list.noBands"),
          description: t("admin:reference.bands.list.noBandsHint"),
        };

  let footer: string | undefined;
  if (hasBands && activeFilterCount > 0) footer = t("admin:reference.bands.list.shownCount", { count: bandCount, shown: list.rows.length });
  else if (hasBands) footer = t("common:labels.bands", { count: bandCount });

  let notice: ReactNode = null;
  if (hasStaleRows) {
    notice = <StaleDataNotice onRetry={list.refetch} isRetrying={list.isFetching} className={STALE_NOTICE_CORNER_CLASS} />;
  } else if (hasBands && list.haveDetailsFailed) {
    notice = (
      <StaleDataNotice
        message={t("admin:reference.bands.list.detailsFailed")}
        onRetry={list.retryDetails}
        isRetrying={list.isRetryingDetails}
        className={STALE_NOTICE_CORNER_CLASS}
      />
    );
  } else if (isUpdating) {
    notice = <DataTable.UpdatingIndicator className="z-40" />;
  }

  return (
    <>
      <ReferenceListPage
        title={t("nav:items.bands")}
        description={t("admin:reference.bands.list.description")}
        action={<AddRecordButton label={t("admin:reference.bands.actions.add")} isCompactOnPhones onClick={openAddDialog} />}
        toolbar={<BandListToolbar {...filterProps} />}
        mobileToolbar={<BandListMobileFilters {...filterProps} />}
        footer={footer}
        footerNote={t("admin:reference.bands.list.codeNote")}
        notice={notice}
        isBusy={list.isFetching}
      >
        <BandListTable
          rows={list.rows}
          viewState={viewState}
          emptyState={emptyState}
          isRetrying={list.isFetching}
          onRetry={list.refetch}
          onEdit={openEditDialog}
          onDelete={openDeleteDialog}
        />
      </ReferenceListPage>
      <BandDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} band={editedBand} bands={list.bands} />
      {bandToDelete === null ? null : (
        <BandDeleteDialog
          band={bandToDelete}
          cellCount={list.cellsByBand === null ? null : (list.cellsByBand.get(bandToDelete.id) ?? 0)}
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        />
      )}
    </>
  );
}
