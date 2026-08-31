import { Cancel01Icon, FilterIcon, Location01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useDeferredValue, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { DATA_TABLE_HEADER_HEIGHT, DATA_TABLE_PAGINATION_HEIGHT, DATA_TABLE_ROW_HEIGHT } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNavActionTarget } from "@/contexts/navActions";
import { operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/queries";
import { fetchPlannedMeasurements } from "@/features/si2pem/api";
import { MeasurementsDataTable } from "@/features/si2pem/components/measurementsDataTable";
import { useIsMobile } from "@/hooks/useMobile";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { getOperatorColor } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";
import type { Operator, Region } from "@/types/station";

const TABLE_PAGINATION_CONFIG = {
  rowHeight: DATA_TABLE_ROW_HEIGHT,
  headerHeight: DATA_TABLE_HEADER_HEIGHT,
  paginationHeight: DATA_TABLE_PAGINATION_HEIGHT,
  minRows: 1,
};
type Tab = "PLANNED" | "COMPLETED" | "CANCELED" | "INACTIVE";

const PEM_MNC_TO_ENTITY: Record<number, string> = {
  26002: "T-Mobile Polska S.A.",
  26003: "Orange Polska S.A.",
  26006: "P4 Sp. z o.o.",
  26001: "Towerlink Poland Sp. z o.o.",
};
const PEM_MNCS = new Set(Object.keys(PEM_MNC_TO_ENTITY).map(Number));
const PEM_TABS: Tab[] = ["PLANNED", "COMPLETED", "CANCELED", "INACTIVE"];

type PEMMeasurementsMobileRailProps = {
  tab: Tab;
  stationId: string;
  operator: string;
  region: number | null;
  operators: Operator[];
  regions: Region[];
  onTabChange: (value: Tab) => void;
  onStationIdChange: (value: string) => void;
  onOperatorChange: (value: string | null) => void;
  onRegionChange: (value: number | null) => void;
  onClear: () => void;
};

function PEMMeasurementsMobileRail({
  tab,
  stationId,
  operator,
  region,
  operators,
  regions,
  onTabChange,
  onStationIdChange,
  onOperatorChange,
  onRegionChange,
  onClear,
}: PEMMeasurementsMobileRailProps) {
  const { t } = useTranslation(["pem", "common"]);
  const hasSearch = stationId.trim().length > 0;
  const hasActiveFilters = hasSearch || operator !== "" || region !== null;

  return (
    <div className="flex items-center gap-1">
      {PEM_TABS.map((value) => (
        <Button
          key={value}
          type="button"
          size="sm"
          variant={tab === value ? "default" : "outline"}
          className={cn("h-8 shrink-0 rounded-full px-3 text-xs", tab !== value && "bg-background dark:bg-background")}
          aria-pressed={tab === value}
          onClick={() => onTabChange(value)}
        >
          {t(`tabs.${value.toLowerCase() as "planned" | "completed" | "canceled" | "inactive"}`)}
        </Button>
      ))}

      <MobileFilterChip active={hasSearch} icon={Search01Icon} label={t("common:labels.search")}>
        <MobileFilterPanelTitle>{t("common:labels.search")}</MobileFilterPanelTitle>
        <div className="relative">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={stationId}
            onChange={(event) => onStationIdChange(event.currentTarget.value)}
            placeholder={t("filters.stationIdPlaceholder")}
            className="h-9 w-full bg-background py-2 pl-8 pr-8 text-sm"
          />
          {hasSearch ? (
            <button
              type="button"
              onClick={() => onStationIdChange("")}
              className="absolute right-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label={t("common:actions.clear")}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            </button>
          ) : null}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={operator !== ""} count={operator === "" ? 0 : 1} icon={FilterIcon} label={t("common:labels.operator")}>
        <MobileFilterPanelTitle>{t("common:labels.operator")}</MobileFilterPanelTitle>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          <button
            type="button"
            aria-pressed={operator === ""}
            onClick={() => onOperatorChange(null)}
            className={cn(
              "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
              operator === "" ? "bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            {t("common:labels.allOperators")}
          </button>
          {operators.map((item) => {
            const value = PEM_MNC_TO_ENTITY[item.mnc] ?? item.name;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={operator === value}
                onClick={() => onOperatorChange(value)}
                className={cn(
                  "flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors",
                  operator === value ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: getOperatorColor(item.mnc) }} />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
              </button>
            );
          })}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={region !== null} count={region === null ? 0 : 1} icon={Location01Icon} label={t("common:labels.region")}>
        <MobileFilterPanelTitle>{t("common:labels.region")}</MobileFilterPanelTitle>
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
      </MobileFilterChip>

      {hasActiveFilters ? (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          {t("common:actions.clearAll")}
        </button>
      ) : null}
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
  const [tab, setTab] = useState<Tab>("PLANNED");
  const [stationIdInput, setStationIdInput] = useState("");
  const [operatorFilter, setOperatorFilter] = useState<string>("");
  const [regionFilter, setRegionFilter] = useState<number | null>(null);
  const stationId = useDeferredValue(stationIdInput);

  const { data: allOperators = [] } = useQuery(operatorsQueryOptions());
  const { data: allRegions = [] } = useQuery(regionsQueryOptions());
  const pemOperators = allOperators.filter((op) => PEM_MNCS.has(op.mnc));
  const selectedOperatorObj = pemOperators.find((op) => PEM_MNC_TO_ENTITY[op.mnc] === operatorFilter) ?? null;

  const { containerRef, pagination, setPagination, pageSizeOptions } = useTablePagination(TABLE_PAGINATION_CONFIG);

  const resetPage = useCallback(() => setPagination((prev) => ({ ...prev, pageIndex: 0 })), [setPagination]);

  const { data, isLoading } = useQuery({
    queryKey: ["pem", "measurements", tab, pagination.pageIndex, pagination.pageSize, stationId, operatorFilter, regionFilter],
    queryFn: () =>
      fetchPlannedMeasurements({
        page: pagination.pageIndex + 1,
        limit: pagination.pageSize,
        status: tab,
        stationId: stationId || undefined,
        operator: operatorFilter || undefined,
        region: regionFilter ?? undefined,
      }),
    staleTime: 1000 * 60 * 10,
  });

  const measurements = data?.data ?? [];
  const totalItems = data?.totalCount ?? 0;

  const handleTabChange = useCallback(
    (value: Tab) => {
      setTab(value);
      resetPage();
    },
    [resetPage],
  );

  const handleStationIdChange = useCallback(
    (value: string) => {
      setStationIdInput(value);
      resetPage();
    },
    [resetPage],
  );

  const handleOperatorChange = useCallback(
    (value: string | null) => {
      setOperatorFilter(!value || value === "__all__" ? "" : value);
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
    setOperatorFilter("");
    setRegionFilter(null);
    resetPage();
  }, [resetPage]);

  const mobileFilterRail = isMobile ? (
    <PEMMeasurementsMobileRail
      tab={tab}
      stationId={stationIdInput}
      operator={operatorFilter}
      region={regionFilter}
      operators={pemOperators}
      regions={allRegions}
      onTabChange={handleTabChange}
      onStationIdChange={handleStationIdChange}
      onOperatorChange={handleOperatorChange}
      onRegionChange={handleRegionChange}
      onClear={clearFilters}
    />
  ) : null;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="px-6 pt-4 pb-0 shrink-0">
        <h1 className="text-lg font-semibold">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("page.description")}</p>
      </div>

      {!isMobile ? (
        <div className="px-6 py-2.5 border-b shrink-0 flex flex-col sm:flex-row sm:items-end gap-2 mt-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">{tCommon("labels.status")}</span>
            <ButtonGroup>
              {PEM_TABS.map((value) => (
                <Button key={value} size="sm" variant={tab === value ? "default" : "outline"} onClick={() => handleTabChange(value)}>
                  {t(`tabs.${value.toLowerCase() as "planned" | "completed" | "canceled" | "inactive"}`)}
                </Button>
              ))}
            </ButtonGroup>
          </div>

          <div className="hidden sm:block flex-1" />

          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col gap-1 sm:w-48 sm:flex-none">
              <span className="text-xs font-medium text-muted-foreground">{tCommon("labels.search")}</span>
              <div className="relative">
                <HugeiconsIcon
                  icon={Search01Icon}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
                />
                <Input
                  value={stationIdInput}
                  onChange={(event) => handleStationIdChange(event.target.value)}
                  placeholder={t("filters.stationIdPlaceholder")}
                  className="h-8 w-full pl-8 pr-7 bg-transparent placeholder:text-muted-foreground/60"
                />
                {stationIdInput && (
                  <button
                    type="button"
                    onClick={() => {
                      handleStationIdChange("");
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex w-40 shrink-0 flex-col gap-1 sm:w-48">
              <span className="text-xs font-medium text-muted-foreground">{tCommon("labels.operator")}</span>
              <Select value={operatorFilter || "__all__"} onValueChange={handleOperatorChange}>
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue>
                    {selectedOperatorObj ? (
                      <div className="flex items-center gap-2">
                        <div className="size-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(selectedOperatorObj.mnc) }} />
                        <span className="truncate">{selectedOperatorObj.name}</span>
                      </div>
                    ) : (
                      tCommon("labels.allOperators")
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{tCommon("labels.allOperators")}</SelectItem>
                  {pemOperators.map((op) => (
                    <SelectItem key={op.id} value={PEM_MNC_TO_ENTITY[op.mnc] ?? op.name}>
                      <div className="flex items-center gap-2">
                        <div className="size-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(op.mnc) }} />
                        {op.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex w-40 shrink-0 flex-col gap-1 sm:w-52">
              <span className="text-xs font-medium text-muted-foreground">{tCommon("labels.region")}</span>
              <Select value={regionFilter !== null ? String(regionFilter) : "__all__"} onValueChange={handleRegionSelectChange}>
                <SelectTrigger className="h-8 w-full text-sm">
                  <SelectValue>
                    <span className="truncate">
                      {regionFilter !== null
                        ? (allRegions.find((r) => r.id === regionFilter)?.name ?? t("filters.allRegions"))
                        : t("filters.allRegions")}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("filters.allRegions")}</SelectItem>
                  {allRegions.map((r) => (
                    <SelectItem key={r.id} value={String(r.id)}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      ) : null}

      {isMobile && !hasFloatingMobileFilters ? (
        <div className="scrollbar-hide mt-3 w-full min-w-0 overflow-x-auto overflow-y-hidden border-b px-3 py-2.5">
          <div className="w-max">{mobileFilterRail}</div>
        </div>
      ) : null}

      <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 min-h-0 overflow-hidden">
        <div ref={containerRef} className={cn("flex-1 min-h-0 overflow-hidden", hasFloatingMobileFilters && "max-md:mb-10")}>
          <MeasurementsDataTable
            data={measurements}
            status={tab}
            isLoading={isLoading}
            totalItems={totalItems}
            pagination={pagination}
            onPaginationChange={setPagination}
            pageSizeOptions={pageSizeOptions}
            t={t}
            tCommon={tCommon}
            locale={locale}
          />
        </div>
      </div>

      {hasFloatingMobileFilters && navActionTarget
        ? createPortal(
            <div className="w-[calc(100vw-1.5rem)] min-w-0 md:hidden">
              <div className="scrollbar-hide min-w-0 flex-1 overflow-x-auto overflow-y-hidden">
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
  staticData: {
    mainClassName: "overflow-hidden",
  },
});
