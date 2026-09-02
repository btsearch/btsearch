import Calendar03Icon from "@hugeicons/core-free-icons/Calendar03Icon";
import Cancel01Icon from "@hugeicons/core-free-icons/Cancel01Icon";
import FilterIcon from "@hugeicons/core-free-icons/FilterIcon";
import Location01Icon from "@hugeicons/core-free-icons/Location01Icon";
import Search01Icon from "@hugeicons/core-free-icons/Search01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { DATA_TABLE_HEADER_HEIGHT, DATA_TABLE_PAGINATION_HEIGHT, DATA_TABLE_ROW_HEIGHT } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavActionTarget } from "@/contexts/navActions";
import { operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/queries";
import { type PlannedStatus, fetchPlannedMeasurements } from "@/features/si2pem/api";
import { MeasurementsDataTable } from "@/features/si2pem/components/measurementsDataTable";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import { useDebouncedCallback } from "@/hooks/useDebouncedCallback";
import { useIsMobile } from "@/hooks/useMobile";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { TOP4_MNCS } from "@/lib/operatorUtils";
import { buildStaticPageHead } from "@/lib/seo";
import { cn } from "@/lib/utils";
import type { Operator, Region } from "@/types/station";

const MOBILE_MEASUREMENT_ROW_HEIGHT = 113;
const PEM_MAX_PAGE_SIZE = 100;
const PEM_TABS: PlannedStatus[] = ["PLANNED", "COMPLETED", "CANCELED", "INACTIVE"];

type PEMMeasurementsMobileRailProps = {
  tab: PlannedStatus;
  stationId: string;
  operator: number | null;
  region: number | null;
  operators: Operator[];
  regions: Region[];
  areOperatorsLoading: boolean;
  areRegionsLoading: boolean;
  operatorsError: boolean;
  regionsError: boolean;
  onTabChange: (value: PlannedStatus) => void;
  onStationIdChange: (value: string) => void;
  onOperatorChange: (value: number | null) => void;
  onRegionChange: (value: number | null) => void;
  onClear: () => void;
  onRetryOperators: () => void;
  onRetryRegions: () => void;
};

function PEMMeasurementsMobileRail({
  tab,
  stationId,
  operator,
  region,
  operators,
  regions,
  areOperatorsLoading,
  areRegionsLoading,
  operatorsError,
  regionsError,
  onTabChange,
  onStationIdChange,
  onOperatorChange,
  onRegionChange,
  onClear,
  onRetryOperators,
  onRetryRegions,
}: PEMMeasurementsMobileRailProps) {
  const { t } = useTranslation(["pem", "common"]);
  const hasSearch = stationId.trim().length > 0;
  const hasActiveFilters = hasSearch || operator !== null || region !== null;

  return (
    <div className="flex items-center gap-1" role="group" aria-label={t("filters.controls")}>
      <div role="group" aria-label={t("common:labels.status")}>
        <MobileFilterChip
          active
          icon={Calendar03Icon}
          label={tab === "INACTIVE" ? t("tabs.inactiveMobile") : t(`tabs.${tab.toLowerCase() as "planned" | "completed" | "canceled"}`)}
        >
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
                {t(`tabs.${value.toLowerCase() as "planned" | "completed" | "canceled" | "inactive"}`)}
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
              value={stationId}
              onChange={(event) => onStationIdChange(event.currentTarget.value)}
              placeholder={t("filters.stationIdPlaceholder")}
              aria-label={t("common:labels.stationId")}
              className="h-9 w-full bg-background py-2 pl-8 pr-8 text-sm"
            />
            {hasSearch ? (
              <button
                type="button"
                onClick={() => onStationIdChange("")}
                className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={t("common:actions.clear")}
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </MobileFilterChip>

        <MobileFilterChip active={operator !== null} count={operator === null ? 0 : 1} icon={FilterIcon} label={t("common:labels.operator")}>
          <MobileFilterPanelTitle>{t("common:labels.operator")}</MobileFilterPanelTitle>
          {operatorsError ? (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground" role="alert">
              <span>{t("common:placeholder.errorFetching")}</span>
              <Button type="button" variant="outline" size="xs" onClick={onRetryOperators}>
                {t("common:actions.retry")}
              </Button>
            </div>
          ) : areOperatorsLoading ? (
            <div className="text-sm text-muted-foreground" role="status">
              {t("common:actions.loading")}
            </div>
          ) : (
            <div className="grid max-h-64 gap-1 overflow-y-auto">
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
              {operators.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={operator === item.mnc}
                  onClick={() => onOperatorChange(item.mnc)}
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                    operator === item.mnc ? "bg-primary/10 text-primary" : "hover:bg-muted",
                  )}
                >
                  <DialogOperatorName name={item.name} mnc={item.mnc} compact />
                </button>
              ))}
            </div>
          )}
        </MobileFilterChip>

        <MobileFilterChip active={region !== null} count={region === null ? 0 : 1} icon={Location01Icon} label={t("common:labels.region")}>
          <MobileFilterPanelTitle>{t("common:labels.region")}</MobileFilterPanelTitle>
          {regionsError ? (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground" role="alert">
              <span>{t("common:placeholder.errorFetching")}</span>
              <Button type="button" variant="outline" size="xs" onClick={onRetryRegions}>
                {t("common:actions.retry")}
              </Button>
            </div>
          ) : areRegionsLoading ? (
            <div className="text-sm text-muted-foreground" role="status">
              {t("common:actions.loading")}
            </div>
          ) : (
            <div className="grid max-h-64 gap-1 overflow-y-auto">
              <button
                type="button"
                aria-pressed={region === null}
                onClick={() => onRegionChange(null)}
                className={cn(
                  "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                  region === null ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                {t("filters.allRegions")}
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
            </div>
          )}
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
  const hasFloatingMobileFilters = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const locale = i18n.language;
  const [tab, setTab] = useState<PlannedStatus>("PLANNED");
  const [stationIdInput, setStationIdInput] = useState("");
  const [activeStationId, setActiveStationId] = useState("");
  const [operatorFilter, setOperatorFilter] = useState<number | null>(null);
  const [regionFilter, setRegionFilter] = useState<number | null>(null);

  const {
    data: allOperators = [],
    isLoading: areOperatorsLoading,
    isError: operatorsError,
    refetch: refetchOperators,
  } = useQuery(operatorsQueryOptions());
  const { data: allRegions = [], isLoading: areRegionsLoading, isError: regionsError, refetch: refetchRegions } = useQuery(regionsQueryOptions());
  const pemOperators = allOperators.filter((operator) => TOP4_MNCS.includes(operator.mnc));
  const selectedOperatorObj = pemOperators.find((operator) => operator.mnc === operatorFilter) ?? null;

  const { containerRef, pagination, setPagination, pageSizeOptions, isPageSizeMeasured } = useTablePagination({
    rowHeight: isMobile ? MOBILE_MEASUREMENT_ROW_HEIGHT : DATA_TABLE_ROW_HEIGHT,
    headerHeight: isMobile ? 0 : DATA_TABLE_HEADER_HEIGHT,
    paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
    minRows: 1,
  });
  const pemPageSizeOptions = pageSizeOptions.filter((pageSize) => pageSize <= PEM_MAX_PAGE_SIZE);

  const resetPage = useCallback(() => setPagination((prev) => ({ ...prev, pageIndex: 0 })), [setPagination]);
  const debouncedStationIdUpdate = useDebouncedCallback((value: string) => {
    setActiveStationId(value);
    resetPage();
  }, 300);

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["pem", "measurements", tab, pagination.pageIndex, pagination.pageSize, activeStationId, operatorFilter, regionFilter],
    queryFn: ({ signal }) =>
      fetchPlannedMeasurements(
        {
          page: pagination.pageIndex + 1,
          limit: pagination.pageSize,
          status: tab,
          stationId: activeStationId || undefined,
          operators: operatorFilter === null ? undefined : [operatorFilter],
          region: regionFilter ?? undefined,
        },
        signal,
      ),
    enabled: isPageSizeMeasured,
    staleTime: 1000 * 60 * 10,
  });

  const measurements = data?.data ?? [];
  const totalItems = data?.totalCount ?? 0;
  const hasActiveFilters = activeStationId !== "" || operatorFilter !== null || regionFilter !== null;
  const showInitialLoading = !isPageSizeMeasured || isLoading;

  const handleTabChange = useCallback(
    (value: PlannedStatus) => {
      setTab(value);
      resetPage();
    },
    [resetPage],
  );

  const handleStationIdChange = useCallback(
    (value: string) => {
      setStationIdInput(value);
      const normalized = value.trim();
      debouncedStationIdUpdate(normalized);
      if (normalized === "") {
        setActiveStationId("");
        resetPage();
      }
    },
    [debouncedStationIdUpdate, resetPage],
  );

  const handleOperatorChange = useCallback(
    (value: number | null) => {
      setOperatorFilter(value);
      resetPage();
    },
    [resetPage],
  );

  const handleRegionChange = useCallback(
    (value: number | null) => {
      setRegionFilter(value);
      resetPage();
    },
    [resetPage],
  );

  const handleRegionSelectChange = useCallback(
    (value: string | null) => handleRegionChange(!value || value === "__all__" ? null : Number(value)),
    [handleRegionChange],
  );

  const clearFilters = useCallback(() => {
    setStationIdInput("");
    setActiveStationId("");
    debouncedStationIdUpdate("");
    setOperatorFilter(null);
    setRegionFilter(null);
    resetPage();
  }, [debouncedStationIdUpdate, resetPage]);

  const mobileFilterRail = isMobile ? (
    <PEMMeasurementsMobileRail
      tab={tab}
      stationId={stationIdInput}
      operator={operatorFilter}
      region={regionFilter}
      operators={pemOperators}
      regions={allRegions}
      areOperatorsLoading={areOperatorsLoading}
      areRegionsLoading={areRegionsLoading}
      operatorsError={operatorsError}
      regionsError={regionsError}
      onTabChange={handleTabChange}
      onStationIdChange={handleStationIdChange}
      onOperatorChange={handleOperatorChange}
      onRegionChange={handleRegionChange}
      onClear={clearFilters}
      onRetryOperators={() => void refetchOperators()}
      onRetryRegions={() => void refetchRegions()}
    />
  ) : null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 px-3 pt-3">
        <h1 className="text-2xl font-bold tracking-tight">{t("page.title")}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t("page.description")}</p>
      </div>

      {!isMobile ? (
        <div className="mt-3 flex shrink-0 flex-col gap-2 border-b px-3 py-2.5 sm:flex-row sm:items-end">
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
                  aria-pressed={tab === value}
                  onClick={() => handleTabChange(value)}
                >
                  {t(`tabs.${value.toLowerCase() as "planned" | "completed" | "canceled" | "inactive"}`)}
                </Button>
              ))}
            </ButtonGroup>
          </div>

          <div className="hidden sm:block flex-1" />

          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1 sm:w-48 sm:flex-none">
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
                  value={stationIdInput}
                  onChange={(event) => handleStationIdChange(event.target.value)}
                  placeholder={t("filters.stationIdPlaceholder")}
                  className="h-8 w-full pl-8 pr-7 bg-transparent placeholder:text-muted-foreground/60"
                />
                {stationIdInput ? (
                  <button
                    type="button"
                    onClick={() => handleStationIdChange("")}
                    aria-label={tCommon("actions.clear")}
                    className="absolute right-1 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" aria-hidden="true" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex w-40 shrink-0 flex-col gap-1 sm:w-48">
              <Label htmlFor="pem-operator-filter" className="text-xs font-medium text-muted-foreground">
                {tCommon("labels.operator")}
              </Label>
              <Select
                value={operatorFilter === null ? "__all__" : String(operatorFilter)}
                onValueChange={(value) => handleOperatorChange(!value || value === "__all__" ? null : Number(value))}
              >
                <SelectTrigger id="pem-operator-filter" className="h-8 w-full text-sm" disabled={areOperatorsLoading}>
                  <SelectValue>
                    {selectedOperatorObj ? (
                      <DialogOperatorName name={selectedOperatorObj.name} mnc={selectedOperatorObj.mnc} compact />
                    ) : areOperatorsLoading ? (
                      tCommon("actions.loading")
                    ) : operatorsError ? (
                      tCommon("placeholder.errorFetching")
                    ) : (
                      tCommon("labels.allOperators")
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {operatorsError ? (
                    <div className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm text-muted-foreground" role="alert">
                      <span>{tCommon("placeholder.errorFetching")}</span>
                      <Button type="button" variant="outline" size="xs" onClick={() => void refetchOperators()}>
                        {tCommon("actions.retry")}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <SelectItem value="__all__">{tCommon("labels.allOperators")}</SelectItem>
                      {pemOperators.length === 0 ? (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">{tCommon("placeholder.noOperatorsFound")}</p>
                      ) : null}
                      {pemOperators.map((op) => (
                        <SelectItem key={op.id} value={String(op.mnc)}>
                          <DialogOperatorName name={op.name} mnc={op.mnc} compact labelClassName="text-sm leading-5 font-normal" />
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex w-40 shrink-0 flex-col gap-1 sm:w-52">
              <Label htmlFor="pem-region-filter" className="text-xs font-medium text-muted-foreground">
                {tCommon("labels.region")}
              </Label>
              <Select value={regionFilter !== null ? String(regionFilter) : "__all__"} onValueChange={handleRegionSelectChange}>
                <SelectTrigger id="pem-region-filter" className="h-8 w-full text-sm" disabled={areRegionsLoading}>
                  <SelectValue>
                    <span className="truncate">
                      {areRegionsLoading
                        ? tCommon("actions.loading")
                        : regionsError
                          ? tCommon("placeholder.errorFetching")
                          : regionFilter !== null
                            ? (allRegions.find((r) => r.id === regionFilter)?.name ?? t("filters.allRegions"))
                            : t("filters.allRegions")}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {regionsError ? (
                    <div className="flex items-center justify-between gap-3 px-2 py-1.5 text-sm text-muted-foreground" role="alert">
                      <span>{tCommon("placeholder.errorFetching")}</span>
                      <Button type="button" variant="outline" size="xs" onClick={() => void refetchRegions()}>
                        {tCommon("actions.retry")}
                      </Button>
                    </div>
                  ) : (
                    <>
                      <SelectItem value="__all__">{t("filters.allRegions")}</SelectItem>
                      {allRegions.length === 0 ? (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">{tCommon("placeholder.noRegionsFound")}</p>
                      ) : null}
                      {allRegions.map((r) => (
                        <SelectItem key={r.id} value={String(r.id)}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ) : null}

      {isMobile && !hasFloatingMobileFilters ? (
        <div className="relative mt-3 w-full min-w-0 border-b after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-6 after:bg-gradient-to-l after:from-background after:to-transparent">
          <div className="scrollbar-hide overflow-x-auto overflow-y-hidden px-3 py-2.5 pr-8">
            <div className="w-max">{mobileFilterRail}</div>
          </div>
        </div>
      ) : null}

      <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 min-h-0 overflow-hidden">
        <div ref={containerRef} className={cn("flex-1 min-h-0 overflow-hidden", hasFloatingMobileFilters && "max-md:mb-10")}>
          <MeasurementsDataTable
            data={measurements}
            status={tab}
            isLoading={showInitialLoading}
            isError={isError}
            isFetching={isFetching}
            hasActiveFilters={hasActiveFilters}
            onRetry={() => void refetch()}
            totalItems={totalItems}
            pagination={pagination}
            onPaginationChange={setPagination}
            pageSizeOptions={pemPageSizeOptions}
            t={t}
            tCommon={tCommon}
            locale={locale}
            isMobile={isMobile}
          />
        </div>
      </div>

      {hasFloatingMobileFilters && navActionTarget
        ? createPortal(
            <div className="relative w-[calc(100vw-1.5rem)] min-w-0 after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-6 after:bg-gradient-to-l after:from-background after:to-transparent md:hidden">
              <div className="scrollbar-hide min-w-0 flex-1 overflow-x-auto overflow-y-hidden pr-8">
                <div className="w-max">{mobileFilterRail}</div>
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
  },
});
