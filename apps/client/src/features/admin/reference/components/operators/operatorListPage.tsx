import { Add01Icon, CellularNetworkIcon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { AddRecordButton, type RecordListEmptyState } from "../shared/recordListPrimitives";
import { ReferenceListPage } from "../shared/referenceListPage";
import { OperatorCreateDialog } from "./operatorCreateDialog";
import type { OperatorListCriteria } from "./operatorListCriteria";
import { type OperatorListFilterProps, OperatorListMobileToolbar, OperatorListToolbar } from "./operatorListFilters";
import { OperatorListMobileList } from "./operatorListMobileList";
import { OperatorListTable } from "./operatorListTable";
import { type OperatorListSecondaryFailure, useOperatorListRows } from "./useOperatorListRows";
import { Button } from "@/components/ui/button";
import { DataTable, getDataTableViewState } from "@/components/ui/data-table";
import { STALE_NOTICE_CORNER_CLASS, StaleDataNotice } from "@/components/ui/error-state";
import { useUserSearchText } from "@/features/admin/users/components/list/useUserSearchText";
import { ClearFiltersButton } from "@/features/shared/filterPanel";
import { useIsMobile } from "@/hooks/useMobile";

type OperatorListPageProps = {
  criteria: OperatorListCriteria;
  onCriteriaChange: (changes: Partial<OperatorListCriteria>) => void;
};

const SECONDARY_FAILURE_KEYS: Record<OperatorListSecondaryFailure, string> = {
  brands: "reference.operators.brandsLoadFailed",
  stations: "reference.operators.stationsLoadFailed",
};

export function OperatorListPage({ criteria, onCriteriaChange }: OperatorListPageProps) {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const {
    text: searchText,
    changeText: changeSearchText,
    clearText: clearSearchText,
  } = useUserSearchText(criteria.query, (query) => onCriteriaChange({ query }));
  const list = useOperatorListRows({ searchText, countryCodes: criteria.countryCodes, sort: criteria.sort });

  const { rows, selectedCountryCodes } = list;
  const hasRows = rows.length > 0;
  const hasSearchText = searchText.trim() !== "";
  const activeFilterCount = Number(hasSearchText) + Number(selectedCountryCodes.length > 0);
  const onlyCountryCode = selectedCountryCodes.length === 1 ? selectedCountryCodes[0] : undefined;
  const viewState = getDataTableViewState(list.isLoading, list.hasLoadFailed, hasRows);
  const isUpdating = list.isFetching && !list.isLoading && !list.hasLoadFailed && !list.hasStaleRows;
  const addLabel = t("reference.operators.add");

  function clearFilters() {
    clearSearchText();
    onCriteriaChange({ query: "", countryCodes: [] });
  }

  function openCreateDialog() {
    setIsCreateOpen(true);
  }

  function openOperator(operatorId: number) {
    void navigate({ to: "/admin/operators/$id", params: { id: String(operatorId) } });
  }

  const filterProps: OperatorListFilterProps = {
    searchText,
    countryOptions: list.countryOptions,
    countryCodes: selectedCountryCodes,
    activeFilterCount,
    onSearchTextChange: changeSearchText,
    onCountryCodesChange: (countryCodes) => onCriteriaChange({ countryCodes }),
    onClearFilters: clearFilters,
  };
  const addFirstOperatorButton = (
    <Button type="button" size="sm" className="cursor-pointer" onClick={openCreateDialog}>
      <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden="true" />
      {addLabel}
    </Button>
  );

  let emptyState: RecordListEmptyState;
  if (list.total === 0) {
    emptyState = {
      icon: CellularNetworkIcon,
      title: t("reference.operators.empty.none"),
      description: t("reference.operators.empty.addFirst"),
      action: addFirstOperatorButton,
    };
  } else if (!hasSearchText && onlyCountryCode !== undefined) {
    emptyState = {
      icon: CellularNetworkIcon,
      title: t("reference.operators.empty.country"),
      description: t("reference.operators.empty.addFirst"),
      action: addFirstOperatorButton,
    };
  } else {
    emptyState = {
      icon: Search01Icon,
      title: t("reference.operators.empty.noMatch"),
      description: t("users.list.empty.description"),
      action: <ClearFiltersButton count={activeFilterCount} onClick={clearFilters} className="cursor-pointer" />,
    };
  }

  let notice: ReactNode = null;
  if (list.hasStaleRows) {
    notice = <StaleDataNotice onRetry={list.refetch} isRetrying={list.isFetching} className={STALE_NOTICE_CORNER_CLASS} />;
  } else if (list.secondaryFailure !== null && viewState === "ready") {
    notice = (
      <StaleDataNotice
        message={t(SECONDARY_FAILURE_KEYS[list.secondaryFailure])}
        onRetry={list.retrySecondary}
        isRetrying={list.isRetryingSecondary}
        className={STALE_NOTICE_CORNER_CLASS}
      />
    );
  } else if (isUpdating) {
    notice = <DataTable.UpdatingIndicator className="z-40" />;
  }

  let footer: string | undefined;
  if (viewState === "ready" || viewState === "empty") {
    footer =
      activeFilterCount > 0
        ? t("reference.operators.countFiltered", { shown: rows.length, count: list.total })
        : t("reference.operators.count", { count: list.total });
  }

  return (
    <>
      <ReferenceListPage
        title={t("nav:items.operators")}
        description={t("reference.operators.description")}
        action={<AddRecordButton label={addLabel} isCompactOnPhones onClick={openCreateDialog} />}
        toolbar={<OperatorListToolbar {...filterProps} />}
        mobileToolbar={<OperatorListMobileToolbar {...filterProps} />}
        footer={footer}
        notice={notice}
        isBusy={list.isLoading || list.isFetching}
      >
        {isMobile ? (
          <OperatorListMobileList rows={rows} viewState={viewState} emptyState={emptyState} isRetrying={list.isFetching} onRetry={list.refetch} />
        ) : (
          <OperatorListTable
            rows={rows}
            viewState={viewState}
            sort={criteria.sort}
            emptyState={emptyState}
            isRetrying={list.isFetching}
            onSortChange={(sort) => onCriteriaChange({ sort })}
            onRetry={list.refetch}
            onOpenOperator={openOperator}
          />
        )}
      </ReferenceListPage>
      <OperatorCreateDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} defaultCountryCode={onlyCountryCode} />
    </>
  );
}
