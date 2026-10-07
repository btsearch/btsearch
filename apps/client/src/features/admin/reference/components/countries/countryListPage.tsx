import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { useReferenceAccess } from "../../access/useReferenceAccess";
import { AddRecordButton } from "../shared/recordListPrimitives";
import { ReferenceListPage } from "../shared/referenceListPage";
import { CountryAddDialog } from "./countryAddDialog";
import { CountryListTable } from "./countryListTable";
import { type CountryListRow, useCountryListPreload, useCountryListRows } from "./useCountryListRows";
import { ForbiddenState } from "@/components/auth/requireRole";
import { Button } from "@/components/ui/button";
import { DataTable, getDataTableViewState } from "@/components/ui/data-table";
import { PageErrorState, STALE_NOTICE_CORNER_CLASS, StaleDataNotice } from "@/components/ui/error-state";
import { useIsMobile } from "@/hooks/useMobile";

type CountryListProps = {
  isAdmin: boolean;
  canOpenCountry: (countryCode: string) => boolean;
};

const NO_ROWS: CountryListRow[] = [];

function CountryListPending() {
  const { t } = useTranslation("admin");
  const isMobile = useIsMobile();
  useCountryListPreload();

  return (
    <ReferenceListPage title={t("nav:items.countries")} description={t("reference.countries.description")} isBusy>
      <CountryListTable rows={NO_ROWS} viewState="loading" isMobile={isMobile} />
    </ReferenceListPage>
  );
}

function CountryList({ isAdmin, canOpenCountry }: CountryListProps) {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const list = useCountryListRows(canOpenCountry);

  const hasRows = list.rows.length > 0;
  const viewState = getDataTableViewState(list.isLoading, list.hasLoadFailed, hasRows);
  const isUpdating = list.isFetching && !list.isLoading && !list.hasLoadFailed && !list.hasStaleRows;
  const isCountShown = viewState === "ready" || viewState === "empty";
  const addLabel = t("reference.countries.add");

  function openAddDialog() {
    setIsAddDialogOpen(true);
  }

  function openCountry(countryCode: string) {
    void navigate({ to: "/admin/countries/$code", params: { code: countryCode } });
  }

  let notice: ReactNode = null;
  if (list.hasStaleRows) notice = <StaleDataNotice onRetry={list.refetch} isRetrying={list.isFetching} className={STALE_NOTICE_CORNER_CLASS} />;
  else if (hasRows && list.haveDetailsFailed) {
    notice = (
      <StaleDataNotice
        message={t("reference.countries.detailsLoadFailed")}
        onRetry={list.retryDetails}
        isRetrying={list.isRetryingDetails}
        className={STALE_NOTICE_CORNER_CLASS}
      />
    );
  } else if (isUpdating) notice = <DataTable.UpdatingIndicator className="z-40" />;

  return (
    <>
      <ReferenceListPage
        title={t("nav:items.countries")}
        description={t("reference.countries.description")}
        action={isAdmin ? <AddRecordButton label={addLabel} isCompactOnPhones onClick={openAddDialog} /> : undefined}
        footer={isCountShown ? t("admin:auditLogs.counts.countries", { count: list.rows.length }) : undefined}
        notice={notice}
        isBusy={list.isLoading || list.isFetching}
      >
        <CountryListTable
          rows={list.rows}
          viewState={viewState}
          isMobile={isMobile}
          isRetrying={list.isFetching}
          emptyDescription={isAdmin ? t("reference.countries.empty.description") : undefined}
          emptyAction={
            isAdmin ? (
              <Button type="button" variant="outline" className="cursor-pointer" onClick={openAddDialog}>
                <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" aria-hidden="true" />
                {addLabel}
              </Button>
            ) : undefined
          }
          onRetry={list.refetch}
          onOpenCountry={openCountry}
        />
      </ReferenceListPage>
      {isAdmin ? (
        <CountryAddDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} existingCountryCodes={list.existingCountryCodes} />
      ) : null}
    </>
  );
}

export function CountryListPage() {
  const access = useReferenceAccess();

  if (access.isPending) return <CountryListPending />;
  if (access.hasLoadFailed) return <PageErrorState onRetry={access.retry} />;
  if (!access.canOpenCountries) return <ForbiddenState />;

  return <CountryList isAdmin={access.isAdmin} canOpenCountry={access.canOpenCountry} />;
}
