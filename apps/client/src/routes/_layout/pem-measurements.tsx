import { Calendar03Icon, Cancel01Icon, FilterIcon, Location01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Operator, Region } from "@openbts/shared/contract";
import { keepPreviousData, skipToken, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { type ReactNode, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { DATA_TABLE_HEADER_HEIGHT, DATA_TABLE_PAGINATION_HEIGHT, DATA_TABLE_ROW_HEIGHT } from "@/components/ui/data-table";
import { InlineError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavActionTarget } from "@/contexts/navActions";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { REGISTER_COUNTRY_CODE } from "@/features/map/constants";
import { ClearFiltersButton, MobileFilterRailInline } from "@/features/shared/filterPanel";
import { operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { type MeasurementTab, fetchFilingRows, fetchMeasurementTabRows } from "@/features/si2pem/api";
import { InstallationsDataTable } from "@/features/si2pem/components/installationsDataTable";
import { MeasurementsDataTable } from "@/features/si2pem/components/measurementsDataTable";
import { PEM_MOBILE_ROW_HEIGHT } from "@/features/si2pem/components/pemDataTable";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import { toV1OperatorMnc } from "@/features/station-details/station/utils/stations";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useIsMobile } from "@/hooks/useMobile";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { TOP4_MNCS } from "@/lib/cellular/operators";
import { buildStaticPageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";

type PEMTab = MeasurementTab | "installations";

const ALL_FILTER_VALUE = "__all__";
const PEM_MAX_PAGE_SIZE = 100;
const PEM_LIST_STALE_TIME = 1000 * 60 * 10;
const PEM_TABS: PEMTab[] = ["planned", "completed", "canceled", "inactive", "installations"];

function isPEMOperator(operator: Operator) {
  const mnc = toV1OperatorMnc(operator);
  return mnc !== null && TOP4_MNCS.includes(mnc);
}

function parseFilterValue(value: string | null): number | null {
  return !value || value === ALL_FILTER_VALUE ? null : Number(value);
}

function getLookupStateLabel(t: TFunction, isLoading: boolean, hasError: boolean): string | null {
  if (isLoading) return t("common:actions.loading");
  if (hasError) return t("common:error.loadTitle");
  return null;
}

type MobileLookupOptionsProps = {
  hasError: boolean;
  isLoading: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  children: ReactNode;
};

function MobileLookupOptions({ hasError, isLoading, isRetrying, onRetry, children }: MobileLookupOptionsProps) {
  const { t } = useTranslation("common");

  if (hasError) return <InlineError size="sm" onRetry={onRetry} isRetrying={isRetrying} />;
  if (isLoading) {
    return (
      <div className="text-sm text-muted-foreground" role="status">
        {t("actions.loading")}
      </div>
    );
  }

  return <div className="grid max-h-64 gap-1 overflow-y-auto">{children}</div>;
}

type PEMMeasurementsMobileRailProps = {
  tab: PEMTab;
  siteId: string;
  operator: number | null;
  region: number | null;
  operators: Operator[];
  regions: Region[];
  areOperatorsLoading: boolean;
  areRegionsLoading: boolean;
  areOperatorsFetching: boolean;
  areRegionsFetching: boolean;
  operatorsError: boolean;
  regionsError: boolean;
  onTabChange: (value: PEMTab) => void;
  onSiteIdChange: (value: string) => void;
  onOperatorChange: (value: number | null) => void;
  onRegionChange: (value: number | null) => void;
  onClear: () => void;
  onRetryOperators: () => void;
  onRetryRegions: () => void;
};

function PEMMeasurementsMobileRail({
  tab,
  siteId,
  operator,
  region,
  operators,
  regions,
  areOperatorsLoading,
  areRegionsLoading,
  areOperatorsFetching,
  areRegionsFetching,
  operatorsError,
  regionsError,
  onTabChange,
  onSiteIdChange,
  onOperatorChange,
  onRegionChange,
  onClear,
  onRetryOperators,
  onRetryRegions,
}: PEMMeasurementsMobileRailProps) {
  const { t } = useTranslation(["pem", "common"]);
  const hasSearch = siteId.trim().length > 0;
  const hasActiveFilters = hasSearch || operator !== null || region !== null;

  return (
    <div className="flex items-center gap-1" role="group" aria-label={t("filters.controls")}>
      <div role="group" aria-label={t("common:labels.status")}>
        <MobileFilterChip active icon={Calendar03Icon} label={tab === "inactive" ? t("tabs.inactiveMobile") : t(`tabs.${tab}`)}>
          <MobileFilterPanelTitle>{t("common:labels.status")}</MobileFilterPanelTitle>
          <div className="grid gap-1">
            {PEM_TABS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => onTabChange(value)}
                className={cn(
                  "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                  tab === value ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                {t(`tabs.${value}`)}
              </button>
            ))}
          </div>
        </MobileFilterChip>
      </div>

      <div className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

      <div className="flex items-center gap-1" role="group" aria-label={t("common:labels.filters")}>
        <MobileFilterChip active={hasSearch} icon={Search01Icon} label={t("common:labels.search")}>
          <MobileFilterPanelTitle>{t("common:labels.search")}</MobileFilterPanelTitle>
          <div className="relative">
            <HugeiconsIcon
              icon={Search01Icon}
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              {...NO_AUTOFILL_PROPS}
              value={siteId}
              onChange={(event) => onSiteIdChange(event.currentTarget.value)}
              placeholder={t("common:labels.stationId")}
              aria-label={t("common:labels.stationId")}
              className="h-9 w-full bg-background py-2 pl-8 pr-8 text-sm"
            />
            {hasSearch ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => onSiteIdChange("")}
                aria-label={t("common:actions.clear")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </MobileFilterChip>

        <MobileFilterChip active={operator !== null} count={operator === null ? 0 : 1} icon={FilterIcon} label={t("common:labels.operator")}>
          <MobileFilterPanelTitle>{t("common:labels.operator")}</MobileFilterPanelTitle>
          <MobileLookupOptions hasError={operatorsError} isLoading={areOperatorsLoading} isRetrying={areOperatorsFetching} onRetry={onRetryOperators}>
            <button
              type="button"
              aria-pressed={operator === null}
              onClick={() => onOperatorChange(null)}
              className={cn(
                "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                operator === null ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              {t("common:labels.allOperators")}
            </button>
            {operators.length === 0 ? <p className="px-2 py-1 text-sm text-muted-foreground">{t("common:placeholder.noOperatorsFound")}</p> : null}
            {operators.map((item) => {
              const selected = operator === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onOperatorChange(item.id)}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                    selected ? "bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  <DialogOperatorName
                    name={item.name}
                    mnc={toV1OperatorMnc(item)}
                    compact
                    labelClassName={cn("text-sm leading-5 font-normal", selected ? "text-primary" : null)}
                  />
                </button>
              );
            })}
          </MobileLookupOptions>
        </MobileFilterChip>

        <MobileFilterChip active={region !== null} count={region === null ? 0 : 1} icon={Location01Icon} label={t("common:labels.region")}>
          <MobileFilterPanelTitle>{t("common:labels.region")}</MobileFilterPanelTitle>
          <MobileLookupOptions hasError={regionsError} isLoading={areRegionsLoading} isRetrying={areRegionsFetching} onRetry={onRetryRegions}>
            <button
              type="button"
              aria-pressed={region === null}
              onClick={() => onRegionChange(null)}
              className={cn(
                "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                region === null ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              {t("common:labels.allRegions")}
            </button>
            {regions.length === 0 ? <p className="px-2 py-1 text-sm text-muted-foreground">{t("common:placeholder.noRegionsFound")}</p> : null}
            {regions.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={region === item.id}
                onClick={() => onRegionChange(item.id)}
                className={cn(
                  "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                  region === item.id ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
              </button>
            ))}
          </MobileLookupOptions>
        </MobileFilterChip>

        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" aria-hidden="true" />
            {t("common:actions.clearAll")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function PEMMeasurementsPage() {
  const { t, i18n } = useTranslation("pem");
  const { t: tCommon } = useTranslation("common");
  const navActionTarget = useNavActionTarget();
  const isMobile = useIsMobile();
  const { openStationDialog } = useFloatingDialogStack();
  const hasFloatingMobileFilters = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const locale = i18n.language;
  const [tab, setTab] = useState<PEMTab>("planned");
  const [siteIdInput, setSiteIdInput] = useState("");
  const [activeSiteId, setActiveSiteId] = useState("");
  const [operatorFilter, setOperatorFilter] = useState<number | null>(null);
  const [regionFilter, setRegionFilter] = useState<number | null>(null);

  const {
    data: allOperators = [],
    isLoading: areOperatorsLoading,
    isFetching: areOperatorsFetching,
    isLoadingError: operatorsError,
    refetch: refetchOperators,
  } = useQuery(operatorsQueryOptions());
  const {
    data: allRegions = [],
    isLoading: areRegionsLoading,
    isFetching: areRegionsFetching,
    isLoadingError: regionsError,
    refetch: refetchRegions,
  } = useQuery(regionsQueryOptions());

  const { containerRef, pagination, setPagination, autoPageSize, pageSizeOptions, isPageSizeMeasured } = useTablePagination({
    rowHeight: isMobile ? PEM_MOBILE_ROW_HEIGHT : DATA_TABLE_ROW_HEIGHT,
    headerHeight: isMobile ? 0 : DATA_TABLE_HEADER_HEIGHT,
    paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
    minRows: 1,
  });

  function resetPage() {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }

  const debouncedSiteIdUpdate = useDebouncedCallback((value: string) => {
    setActiveSiteId(value);
    resetPage();
  }, 300);

  const listParams = {
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    siteId: activeSiteId || undefined,
    operatorId: operatorFilter ?? undefined,
    regionId: regionFilter ?? undefined,
  };

  const measurementsQuery = useQuery({
    queryKey: ["pem", "measurements", tab, pagination.pageIndex, pagination.pageSize, activeSiteId, operatorFilter, regionFilter],
    queryFn: tab === "installations" ? skipToken : ({ signal }) => fetchMeasurementTabRows({ tab, ...listParams }, signal),
    enabled: isPageSizeMeasured,
    staleTime: PEM_LIST_STALE_TIME,
    placeholderData: (previousData, previousQuery) => (previousQuery?.queryKey[2] === tab ? previousData : undefined),
  });

  const filingsQuery = useQuery({
    queryKey: ["pem", "filings", pagination.pageIndex, pagination.pageSize, activeSiteId, operatorFilter, regionFilter],
    queryFn: tab === "installations" ? ({ signal }) => fetchFilingRows(listParams, signal) : skipToken,
    enabled: isPageSizeMeasured,
    staleTime: PEM_LIST_STALE_TIME,
    placeholderData: keepPreviousData,
  });

  function handleTabChange(value: PEMTab) {
    setTab(value);
    resetPage();
  }

  function handleSiteIdChange(value: string) {
    setSiteIdInput(value);
    const normalized = value.trim();
    debouncedSiteIdUpdate(normalized);
    if (normalized === "") {
      setActiveSiteId("");
      resetPage();
    }
  }

  function handleOperatorChange(value: number | null) {
    setOperatorFilter(value);
    resetPage();
  }

  function handleRegionChange(value: number | null) {
    setRegionFilter(value);
    resetPage();
  }

  function clearFilters() {
    setSiteIdInput("");
    setActiveSiteId("");
    debouncedSiteIdUpdate("");
    setOperatorFilter(null);
    setRegionFilter(null);
    resetPage();
  }

  const activeQuery = tab === "installations" ? filingsQuery : measurementsQuery;
  const refetchRows = activeQuery.refetch;
  const measurementRows = measurementsQuery.data?.rows ?? [];
  const filingRows = filingsQuery.data?.rows ?? [];
  const activeFilterCount = [siteIdInput.trim() !== "", operatorFilter !== null, regionFilter !== null].filter(Boolean).length;
  const pemOperators = allOperators.filter(isPEMOperator);
  const pemRegions = allRegions.filter((region) => region.countryCode === REGISTER_COUNTRY_CODE);
  const selectedOperator = pemOperators.find((operator) => operator.id === operatorFilter);
  const selectedRegion = pemRegions.find((region) => region.id === regionFilter);
  const operatorPlaceholder = getLookupStateLabel(tCommon, areOperatorsLoading, operatorsError) ?? tCommon("labels.allOperators");
  const regionLabel = getLookupStateLabel(tCommon, areRegionsLoading, regionsError) ?? selectedRegion?.name ?? tCommon("labels.allRegions");
  const pemPageSizeOptions = pageSizeOptions.filter((pageSize) => pageSize <= PEM_MAX_PAGE_SIZE);
  const tableProps = {
    isLoading: !isPageSizeMeasured || activeQuery.isLoading,
    isError: activeQuery.isError,
    isFetching: activeQuery.isFetching,
    activeFilterCount,
    onClearFilters: clearFilters,
    onOpenStation: (stationId: number) => openStationDialog(stationId, "internal"),
    onRetry: () => void refetchRows(),
    totalItems: activeQuery.data?.total ?? 0,
    pagination,
    autoPageSize,
    onPaginationChange: setPagination,
    pageSizeOptions: pemPageSizeOptions,
    t,
    tCommon,
    locale,
    isMobile,
  };

  const mobileFilterRail = isMobile ? (
    <PEMMeasurementsMobileRail
      tab={tab}
      siteId={siteIdInput}
      operator={operatorFilter}
      region={regionFilter}
      operators={pemOperators}
      regions={pemRegions}
      areOperatorsLoading={areOperatorsLoading}
      areRegionsLoading={areRegionsLoading}
      areOperatorsFetching={areOperatorsFetching}
      areRegionsFetching={areRegionsFetching}
      operatorsError={operatorsError}
      regionsError={regionsError}
      onTabChange={handleTabChange}
      onSiteIdChange={handleSiteIdChange}
      onOperatorChange={handleOperatorChange}
      onRegionChange={handleRegionChange}
      onClear={clearFilters}
      onRetryOperators={() => void refetchOperators()}
      onRetryRegions={() => void refetchRegions()}
    />
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 flex-col gap-3 px-3 pt-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">{t("nav:items.pem")}</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("page.description")}</p>
        </div>
      </header>

      {!isMobile ? (
        <div className="mt-3 flex shrink-0 flex-wrap items-end gap-2 border-b px-3 py-2.5">
          <div className="flex flex-col gap-1">
            <span id="pem-status-filter-label" className="text-xs font-medium text-muted-foreground">
              {tCommon("labels.status")}
            </span>
            <ButtonGroup aria-labelledby="pem-status-filter-label">
              {PEM_TABS.map((value) => (
                <Button
                  key={value}
                  size="sm"
                  variant={tab === value ? "default" : "outline"}
                  className="cursor-pointer"
                  aria-pressed={tab === value}
                  onClick={() => handleTabChange(value)}
                >
                  {t(`tabs.${value}`)}
                </Button>
              ))}
            </ButtonGroup>
          </div>

          <div className="flex-1" />

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex w-40 flex-col gap-1 xl:w-48">
              <Label htmlFor="pem-station-id-filter" className="text-xs font-medium text-muted-foreground">
                {tCommon("labels.stationId")}
              </Label>
              <div className="relative">
                <HugeiconsIcon
                  icon={Search01Icon}
                  aria-hidden="true"
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
                />
                <Input
                  id="pem-station-id-filter"
                  {...NO_AUTOFILL_PROPS}
                  value={siteIdInput}
                  onChange={(event) => handleSiteIdChange(event.target.value)}
                  placeholder={tCommon("labels.stationId")}
                  className="h-8 w-full pl-8 pr-7 bg-transparent placeholder:text-muted-foreground/60"
                />
                {siteIdInput ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleSiteIdChange("")}
                    aria-label={tCommon("actions.clear")}
                    className="absolute right-1 top-1/2 -translate-y-1/2 cursor-pointer text-muted-foreground"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" aria-hidden="true" />
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex w-44 flex-col gap-1 xl:w-48">
              <Label htmlFor="pem-operator-filter" className="text-xs font-medium text-muted-foreground">
                {tCommon("labels.operator")}
              </Label>
              <Select
                value={operatorFilter === null ? ALL_FILTER_VALUE : String(operatorFilter)}
                onValueChange={(value) => handleOperatorChange(parseFilterValue(value))}
              >
                <SelectTrigger id="pem-operator-filter" className="h-8 w-full text-sm" disabled={areOperatorsLoading}>
                  <SelectValue>
                    {selectedOperator ? (
                      <DialogOperatorName
                        name={selectedOperator.name}
                        mnc={toV1OperatorMnc(selectedOperator)}
                        compact
                        labelClassName="text-sm leading-5 font-normal"
                      />
                    ) : (
                      operatorPlaceholder
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {operatorsError ? (
                    <InlineError size="sm" onRetry={() => refetchOperators()} isRetrying={areOperatorsFetching} />
                  ) : (
                    <>
                      <SelectItem value={ALL_FILTER_VALUE}>{tCommon("labels.allOperators")}</SelectItem>
                      {pemOperators.length === 0 ? (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">{tCommon("placeholder.noOperatorsFound")}</p>
                      ) : null}
                      {pemOperators.map((op) => (
                        <SelectItem key={op.id} value={String(op.id)}>
                          <DialogOperatorName name={op.name} mnc={toV1OperatorMnc(op)} compact labelClassName="text-sm leading-5 font-normal" />
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex w-52 flex-col gap-1">
              <Label htmlFor="pem-region-filter" className="text-xs font-medium text-muted-foreground">
                {tCommon("labels.region")}
              </Label>
              <Select
                value={regionFilter === null ? ALL_FILTER_VALUE : String(regionFilter)}
                onValueChange={(value) => handleRegionChange(parseFilterValue(value))}
              >
                <SelectTrigger id="pem-region-filter" className="h-8 w-full text-sm" disabled={areRegionsLoading}>
                  <SelectValue>
                    <span className="truncate">{regionLabel}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {regionsError ? (
                    <InlineError size="sm" onRetry={() => refetchRegions()} isRetrying={areRegionsFetching} />
                  ) : (
                    <>
                      <SelectItem value={ALL_FILTER_VALUE}>{tCommon("labels.allRegions")}</SelectItem>
                      {pemRegions.length === 0 ? (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">{tCommon("placeholder.noRegionsFound")}</p>
                      ) : null}
                      {pemRegions.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            {activeFilterCount > 0 ? <ClearFiltersButton count={activeFilterCount} onClick={clearFilters} /> : null}
          </div>
        </div>
      ) : null}

      <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 min-h-0 overflow-hidden">
        {isMobile && !hasFloatingMobileFilters ? <MobileFilterRailInline>{mobileFilterRail}</MobileFilterRailInline> : null}
        <div ref={containerRef} className={cn("flex-1 min-h-0 overflow-hidden", hasFloatingMobileFilters && "max-md:mb-10")}>
          {tab === "installations" ? (
            <InstallationsDataTable data={filingRows} {...tableProps} />
          ) : (
            <MeasurementsDataTable data={measurementRows} tab={tab} {...tableProps} />
          )}
        </div>
      </div>

      {hasFloatingMobileFilters && navActionTarget
        ? createPortal(
            <div className="relative w-[calc(100vw-1.5rem)] min-w-0 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-6 after:bg-gradient-to-l after:from-background after:to-transparent md:hidden">
              <div className="scrollbar-hide min-w-0 flex-1 overflow-x-auto overflow-y-hidden pr-8">
                <div className="mx-auto w-max">{mobileFilterRail}</div>
              </div>
            </div>,
            navActionTarget,
          )
        : null}
    </div>
  );
}

export const Route = createFileRoute("/_layout/pem-measurements")({
  component: PEMMeasurementsPage,
  head: () => buildStaticPageHead("/pem-measurements"),
  staticData: {
    mainClassName: "overflow-hidden",
    titleKey: "items.pem",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
