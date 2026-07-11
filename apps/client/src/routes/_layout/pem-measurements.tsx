import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useDeferredValue, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/queries";
import { fetchPlannedMeasurements } from "@/features/si2pem/api";
import { MeasurementsDataTable } from "@/features/si2pem/components/measurementsDataTable";
import { useTablePagination } from "@/hooks/useTablePageSize";
import { getOperatorColor } from "@/lib/operatorUtils";

const TABLE_PAGINATION_CONFIG = { rowHeight: 64, headerHeight: 40, paginationHeight: 45, minRows: 1 };
type Tab = "PLANNED" | "COMPLETED" | "CANCELED" | "INACTIVE";

const PEM_MNC_TO_ENTITY: Record<number, string> = {
  26002: "T-Mobile Polska S.A.",
  26003: "Orange Polska S.A.",
  26006: "P4 Sp. z o.o.",
  26001: "Towerlink Poland Sp. z o.o.",
};
const PEM_MNCS = new Set(Object.keys(PEM_MNC_TO_ENTITY).map(Number));

function PEMMeasurementsPage() {
  const { t, i18n } = useTranslation("pem");
  const { t: tCommon } = useTranslation("common");
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

  const handleTabChange = (value: Tab) => {
    setTab(value);
    resetPage();
  };

  const handleStationIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setStationIdInput(e.target.value);
    resetPage();
  };

  const handleOperatorChange = (value: string | null) => {
    setOperatorFilter(!value || value === "__all__" ? "" : value);
    resetPage();
  };

  const handleRegionChange = (value: string) => {
    setRegionFilter(value === "__all__" ? null : Number(value));
    resetPage();
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="px-6 pt-4 pb-0 shrink-0">
        <h1 className="text-lg font-semibold">{t("page.title")}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{t("page.description")}</p>
      </div>

      <div className="px-6 py-2.5 border-b shrink-0 flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
        <ButtonGroup>
          {(["PLANNED", "COMPLETED", "CANCELED", "INACTIVE"] as const).map((value) => (
            <Button key={value} size="sm" variant={tab === value ? "default" : "outline"} onClick={() => handleTabChange(value)}>
              {t(`tabs.${value.toLowerCase() as "planned" | "completed" | "canceled" | "inactive"}`)}
            </Button>
          ))}
        </ButtonGroup>

        <div className="hidden sm:block flex-1" />

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-48">
            <HugeiconsIcon
              icon={Search01Icon}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none"
            />
            <Input
              value={stationIdInput}
              onChange={handleStationIdChange}
              placeholder={t("filters.stationIdPlaceholder")}
              className="h-8 w-full pl-8 pr-7 bg-transparent placeholder:text-muted-foreground/60"
            />
            {stationIdInput && (
              <button
                type="button"
                onClick={() => {
                  setStationIdInput("");
                  resetPage();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={operatorFilter || "__all__"} onValueChange={handleOperatorChange}>
            <SelectTrigger className="h-8 w-40 sm:w-48 text-sm shrink-0">
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

          <Select value={regionFilter !== null ? String(regionFilter) : "__all__"} onValueChange={handleRegionChange}>
            <SelectTrigger className="h-8 w-40 sm:w-52 text-sm shrink-0">
              <SelectValue>
                <span className="truncate">
                  {regionFilter !== null ? (allRegions.find((r) => r.id === regionFilter)?.name ?? t("filters.allRegions")) : t("filters.allRegions")}
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

      <div className="flex-1 flex flex-col pl-3 pt-3 pr-3 min-h-0 overflow-hidden">
        <div ref={containerRef} className="flex-1 min-h-0 overflow-auto">
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
    </div>
  );
}

export const Route = createFileRoute("/_layout/pem-measurements")({
  component: PEMMeasurementsPage,
  staticData: {
    mainClassName: "overflow-hidden max-md:pb-0",
  },
});
