import { Building03Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Country, StructureOwner } from "../../types";
import type { FacetOption } from "../shared/facetToggles";
import { AddRecordButton, type RecordListEmptyState } from "../shared/recordListPrimitives";
import { ReferenceListPage } from "../shared/referenceListPage";
import { StructureOwnerDeleteDialog } from "./structureOwnerDeleteDialog";
import { StructureOwnerDialog } from "./structureOwnerDialog";
import type { StructureOwnerListCriteria } from "./structureOwnerListCriteria";
import { type StructureOwnerListFilterProps, StructureOwnerListMobileFilters, StructureOwnerListToolbar } from "./structureOwnerListFilters";
import { NO_COUNTRY_FACET } from "./structureOwnerListSearch";
import { StructureOwnerListTable } from "./structureOwnerListTable";
import { sortStructureOwnerRows, useStructureOwnerListRows } from "./useStructureOwnerListRows";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { DataTable, getDataTableViewState } from "@/components/ui/data-table";
import { STALE_NOTICE_CORNER_CLASS, StaleDataNotice } from "@/components/ui/error-state";
import { useUserSearchText } from "@/features/admin/users/components/list/useUserSearchText";
import { listCountryOptions } from "@/features/admin/users/utils/grants";
import { ClearFiltersButton } from "@/features/shared/filterPanel";

type StructureOwnerListPageProps = {
  criteria: StructureOwnerListCriteria;
  onCriteriaChange: (changes: Partial<StructureOwnerListCriteria>) => void;
};

const NO_COUNTRIES: Country[] = [];

export function StructureOwnerListPage({ criteria, onCriteriaChange }: StructureOwnerListPageProps) {
  const { t, i18n } = useTranslation("admin");
  const {
    text: searchText,
    changeText: changeSearchText,
    clearText: clearSearchText,
  } = useUserSearchText(criteria.query, (query) => onCriteriaChange({ query }));
  const list = useStructureOwnerListRows(criteria, searchText);
  const [editedOwner, setEditedOwner] = useState<StructureOwner>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [ownerToDelete, setOwnerToDelete] = useState<StructureOwner | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const rows = sortStructureOwnerRows(list.rows, criteria.sort, list.locationCounts);
  const isLoading = !list.hasOwners && !list.isError;
  const viewState = getDataTableViewState(isLoading, list.isError && !list.hasOwners, rows.length > 0);
  const hasStaleRows = list.isError && list.hasOwners;
  const isUpdating = list.isFetching && !isLoading && !list.isError;
  const activeFilterCount = Number(searchText.trim() !== "") + Number(list.countryFacets.length > 0);
  const onlyCountryFacet = list.countryFacets.length === 1 ? list.countryFacets[0] : undefined;
  const onlyCountryCode = onlyCountryFacet === NO_COUNTRY_FACET ? undefined : onlyCountryFacet;
  const addLabel = t("reference.owners.add");
  const countryOptions: FacetOption<string>[] = [
    ...listCountryOptions(list.countries ?? NO_COUNTRIES, i18n.language).map((country) => ({
      value: country.code,
      label: country.name,
      lead: <CountryCodeTile code={country.code} size="xs" />,
    })),
    { value: NO_COUNTRY_FACET, label: t("reference.owners.noCountry") },
  ];

  function openAddDialog() {
    setEditedOwner(undefined);
    setIsDialogOpen(true);
  }

  function openEditDialog(owner: StructureOwner) {
    setEditedOwner(owner);
    setIsDialogOpen(true);
  }

  function openDeleteDialog(owner: StructureOwner) {
    setOwnerToDelete(owner);
    setIsDeleteDialogOpen(true);
  }

  function clearFilters() {
    clearSearchText();
    onCriteriaChange({ query: "", countryFacets: [] });
  }

  const filterProps: StructureOwnerListFilterProps = {
    searchText,
    countryOptions,
    countryFacets: list.countryFacets,
    activeFilterCount,
    onSearchTextChange: changeSearchText,
    onCountryFacetsChange: (countryFacets) => onCriteriaChange({ countryFacets }),
    onClearFilters: clearFilters,
  };
  const emptyState: RecordListEmptyState =
    list.total > 0
      ? {
          icon: Search01Icon,
          title: t("reference.owners.list.noMatches"),
          description: t("users.list.empty.description"),
          action: <ClearFiltersButton count={activeFilterCount} onClick={clearFilters} className="cursor-pointer" />,
        }
      : {
          icon: Building03Icon,
          title: t("reference.owners.list.empty.title"),
          description: t("reference.owners.list.empty.description"),
          action: <AddRecordButton label={addLabel} onClick={openAddDialog} />,
        };

  let footer: string | undefined;
  if (list.hasOwners && activeFilterCount > 0) footer = t("reference.owners.list.countFiltered", { count: list.total, shown: rows.length });
  else if (list.hasOwners) footer = t("reference.owners.list.count", { count: list.total });

  let notice: ReactNode = null;
  if (hasStaleRows) {
    notice = <StaleDataNotice onRetry={list.refetch} isRetrying={list.isFetching} className={STALE_NOTICE_CORNER_CLASS} />;
  } else if (list.haveLookupsFailed && viewState === "ready") {
    notice = (
      <StaleDataNotice
        message={t("reference.owners.list.lookupsLoadFailed")}
        onRetry={list.retryLookups}
        isRetrying={list.isRetryingLookups}
        className={STALE_NOTICE_CORNER_CLASS}
      />
    );
  } else if (isUpdating) {
    notice = <DataTable.UpdatingIndicator className="z-40" />;
  }

  return (
    <>
      <ReferenceListPage
        title={t("nav:items.structureOwners")}
        description={t("reference.owners.description")}
        action={<AddRecordButton label={addLabel} isCompactOnPhones onClick={openAddDialog} />}
        toolbar={<StructureOwnerListToolbar {...filterProps} />}
        mobileToolbar={<StructureOwnerListMobileFilters {...filterProps} />}
        footer={footer}
        notice={notice}
        isBusy={isLoading || list.isFetching}
      >
        <StructureOwnerListTable
          rows={rows}
          locationCounts={list.locationCounts}
          viewState={viewState}
          emptyState={emptyState}
          isRetrying={list.isFetching}
          onRetry={list.refetch}
          sort={criteria.sort}
          onSortChange={(sort) => onCriteriaChange({ sort })}
          onEdit={openEditDialog}
          onDelete={openDeleteDialog}
        />
      </ReferenceListPage>
      <StructureOwnerDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} owner={editedOwner} defaultCountryCode={onlyCountryCode} />
      {ownerToDelete === null ? null : (
        <StructureOwnerDeleteDialog
          owner={ownerToDelete}
          locations={list.locationCounts.get(ownerToDelete.id)}
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
        />
      )}
    </>
  );
}
