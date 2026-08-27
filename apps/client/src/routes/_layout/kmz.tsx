import {
  AirportTowerIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Calendar03Icon,
  Cancel01Icon,
  Download01Icon,
  FilterIcon,
  Location01Icon,
  MapsIcon,
  RefreshIcon,
  Route02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useNavActionTarget } from "@/contexts/navActions";
import {
  KMZ_SOURCES,
  KMZ_TYPES,
  type KmzFile,
  type KmzSource,
  type KmzType,
  downloadKmzFile,
  isNewKmzFile,
  isUnknownRegionKmzFile,
} from "@/features/kmz/api";
import { useKmzDates, useKmzList } from "@/features/kmz/hooks";
import { regionsQueryOptions } from "@/features/shared/queries";
import { useIsMobile } from "@/hooks/useMobile";
import { formatDayMonthYear, formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Region } from "@/types/station";

const ALL_FILTER_VALUE = "__all__";
const KMZ_SORT_OPTIONS = ["region", "size"] as const;
type KmzSortBy = (typeof KMZ_SORT_OPTIONS)[number];
type KmzOrder = "asc" | "desc";

const KMZ_TYPE_ICONS: Record<KmzType, IconSvgElement> = {
  stations: AirportTowerIcon,
  radiolines: Route02Icon,
};

function KmzTypeSwitcher({ type, onChange }: { type: KmzType; onChange: (type: KmzType) => void }) {
  const { t } = useTranslation("kmz");

  return (
    <ButtonGroup aria-label={t("type.label")}>
      {KMZ_TYPES.map((value) => (
        <Button
          key={value}
          type="button"
          role="tab"
          aria-selected={type === value}
          onClick={() => onChange(value)}
          variant={type === value ? "default" : "outline"}
          aria-pressed={type === value}
        >
          <HugeiconsIcon icon={KMZ_TYPE_ICONS[value]} className="size-4" data-icon="inline-start" />
          {t(`type.${value}`)}
        </Button>
      ))}
    </ButtonGroup>
  );
}

function ClearFiltersButton({ count, onClick, className }: { count: number; onClick: () => void; className?: string }) {
  const { t } = useTranslation("common");
  return (
    <Button type="button" variant="ghost" size="sm" className={cn("text-muted-foreground", className)} onClick={onClick}>
      <HugeiconsIcon icon={Cancel01Icon} className="size-3" data-icon="inline-start" />
      {t("actions.clearAll")}
      <span className="ml-1 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-bold leading-none text-muted-foreground">{count}</span>
    </Button>
  );
}

function KmzStateMessage({ icon, title, subtitle, action }: { icon: IconSvgElement; title: string; subtitle: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center text-center">
      <HugeiconsIcon icon={icon} className="mb-3 size-10 text-muted-foreground/50" />
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{subtitle}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function KmzListSkeleton() {
  return (
    <div className="columns-1 gap-x-8 sm:columns-2 lg:columns-3">
      {Array.from({ length: 9 }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 break-inside-avoid-column border-b border-border/60 py-3">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-7 w-24 shrink-0 rounded-lg" />
        </div>
      ))}
    </div>
  );
}

type KmzMobileFilterRailProps = {
  type: KmzType;
  source: KmzSource;
  date: string | null;
  region: string | null;
  sortBy: KmzSortBy;
  order: KmzOrder;
  availableDates: string[];
  regions: Region[];
  selectedRegion: Region | null;
  activeFilterCount: number;
  filesCount: number;
  onTypeChange: (type: KmzType) => void;
  onSourceChange: (source: KmzSource) => void;
  onDateChange: (date: string) => void;
  onRegionChange: (region: string | null) => void;
  onSortByChange: (sortBy: KmzSortBy) => void;
  onOrderChange: (order: KmzOrder) => void;
  onClearFilters: () => void;
};

function KmzMobileFilterRail({
  type,
  source,
  date,
  region,
  sortBy,
  order,
  availableDates,
  regions,
  selectedRegion,
  activeFilterCount,
  filesCount,
  onTypeChange,
  onSourceChange,
  onDateChange,
  onRegionChange,
  onSortByChange,
  onOrderChange,
  onClearFilters,
}: KmzMobileFilterRailProps) {
  const { t } = useTranslation(["kmz", "common"]);
  const sortActive = sortBy !== KMZ_SORT_OPTIONS[0] || order !== "asc";

  return (
    <div className="flex items-center gap-1">
      {KMZ_TYPES.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={type === value}
          onClick={() => onTypeChange(value)}
          className={cn(
            "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            type === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground hover:bg-muted",
          )}
        >
          <HugeiconsIcon icon={KMZ_TYPE_ICONS[value]} className="size-3.5 shrink-0" />
          {t(`type.${value}`)}
        </button>
      ))}

      {type === "stations" ? (
        <MobileFilterChip active={source !== "all"} count={source !== "all" ? 1 : 0} icon={FilterIcon} label={t("source.label")}>
          <MobileFilterPanelTitle>{t("source.label")}</MobileFilterPanelTitle>
          <div className="grid gap-1">
            {KMZ_SOURCES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onSourceChange(value)}
                className={cn(
                  "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                  source === value ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{t(`source.${value}`)}</span>
              </button>
            ))}
          </div>
        </MobileFilterChip>
      ) : null}

      <MobileFilterChip active={false} icon={Calendar03Icon} label={t("common:labels.date")}>
        <MobileFilterPanelTitle>{t("common:labels.date")}</MobileFilterPanelTitle>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          {availableDates.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">{t("list.noDates")}</p>
          ) : (
            availableDates.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onDateChange(value)}
                className={cn(
                  "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                  date === value ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{formatDayMonthYear(value)}</span>
              </button>
            ))
          )}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={region !== null} count={region === null ? 0 : 1} icon={Location01Icon} label={t("common:labels.region")}>
        <MobileFilterPanelTitle>{t("common:labels.region")}</MobileFilterPanelTitle>
        <div className="grid max-h-64 gap-1 overflow-y-auto">
          <button
            type="button"
            onClick={() => onRegionChange(null)}
            className={cn(
              "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
              region === null ? "bg-primary/10 text-primary" : "hover:bg-muted",
            )}
          >
            <span className="min-w-0 flex-1 truncate">{t("region.allRegions")}</span>
          </button>
          {regions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onRegionChange(item.code)}
              className={cn(
                "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                selectedRegion?.code === item.code ? "bg-primary/10 text-primary" : "hover:bg-muted",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
            </button>
          ))}
        </div>
      </MobileFilterChip>

      <MobileFilterChip active={sortActive} count={sortActive ? 1 : 0} icon={ArrowDown01Icon} label={t("sortLabel")}>
        <MobileFilterPanelTitle>{t("sortLabel")}</MobileFilterPanelTitle>
        <div className="grid gap-3">
          <div className="grid gap-1">
            {KMZ_SORT_OPTIONS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onSortByChange(value)}
                className={cn(
                  "flex h-8 items-center rounded-md px-2 text-left text-sm transition-colors",
                  sortBy === value ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{t(`sort.${value}`)}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {(["asc", "desc"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onOrderChange(value)}
                className={cn(
                  "flex h-8 items-center justify-center rounded-md px-2 text-sm transition-colors",
                  order === value ? "bg-primary/10 text-primary" : "hover:bg-muted",
                )}
              >
                {t(`order.${value}`)}
              </button>
            ))}
          </div>
        </div>
      </MobileFilterChip>

      {activeFilterCount > 0 ? (
        <button
          type="button"
          onClick={onClearFilters}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          {t("common:actions.clearAll")}
        </button>
      ) : null}

      <div className="inline-flex h-8 max-w-44 shrink-0 items-center rounded-full border border-border bg-background px-3 text-xs font-medium text-muted-foreground">
        <HugeiconsIcon icon={MapsIcon} className="mr-1.5 size-3.5 shrink-0" />
        <span className="truncate">{t("list.count", { count: filesCount })}</span>
      </div>
    </div>
  );
}

function KmzListPage() {
  const { t } = useTranslation(["kmz", "common"]);
  const isMobile = useIsMobile();
  const navActionTarget = useNavActionTarget();

  const [type, setType] = useState<KmzType>("stations");
  const [source, setSource] = useState<KmzSource>("all");
  const [date, setDate] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<KmzSortBy>("region");
  const [order, setOrder] = useState<KmzOrder>("asc");
  const [downloadingFileName, setDownloadingFileName] = useState<string | null>(null);

  const { data: datesData, isLoading: isDatesLoading } = useKmzDates(type, source);
  const availableDates = useMemo(() => datesData ?? [], [datesData]);
  const selectedDate = date !== null && availableDates.includes(date) ? date : (availableDates[0] ?? null);

  const { data, isLoading, isError, refetch } = useKmzList({ type, source, date: selectedDate, region }, { enabled: selectedDate !== null });
  const { data: regions = [] } = useQuery(regionsQueryOptions());

  const selectedRegion = useMemo(() => (region === null ? null : (regions.find((item) => item.code === region) ?? null)), [region, regions]);

  const files = useMemo(() => {
    const list = data?.data ?? [];
    return [...list].sort((a, b) => {
      const comparison = sortBy === "size" ? a.size - b.size : (a.region?.name ?? "").localeCompare(b.region?.name ?? "");
      return order === "asc" ? comparison : -comparison;
    });
  }, [data, sortBy, order]);

  const sortLabels = useMemo(() => ({ region: t("sort.region"), size: t("sort.size") }), [t]);
  const showNoDatesState = !isDatesLoading && availableDates.length === 0;
  const activeFilterCount = [type === "stations" && source !== "all", region !== null, sortBy !== "region", order !== "asc"].filter(Boolean).length;
  const showFloatingMobileFilters = isMobile && navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;

  function handleTypeChange(nextType: KmzType) {
    setType(nextType);
    setSource("all");
    setDate(null);
  }

  function handleSourceChange(nextSource: KmzSource) {
    setSource(nextSource);
    setDate(null);
  }

  function handleRegionChange(value: string | null) {
    if (value === null) return;
    setRegion(value === ALL_FILTER_VALUE ? null : value);
  }

  function handleSortChange(value: KmzSortBy | null) {
    if (value === null) return;
    setSortBy(value);
  }

  function toggleOrder() {
    setOrder((current) => (current === "asc" ? "desc" : "asc"));
  }

  function clearFilters() {
    setSource("all");
    setRegion(null);
    setSortBy("region");
    setOrder("asc");
  }

  async function handleDownload(file: KmzFile) {
    setDownloadingFileName(file.filename);
    const success = await downloadKmzFile(file);
    if (!success) toast.error(t("downloadError"));
    setDownloadingFileName(null);
  }

  function getRegionLabel(file: KmzFile) {
    if (isNewKmzFile(file)) return t(`file.new_${file.type}`);
    if (isUnknownRegionKmzFile(file)) return t("region.unknownRegion");
    return file.region?.name ?? t("region.allRegions");
  }

  const content = showNoDatesState ? (
    <KmzStateMessage icon={MapsIcon} title={t("list.noDates")} subtitle={t("list.noDatesSubtitle")} />
  ) : isLoading || isDatesLoading ? (
    <KmzListSkeleton />
  ) : isError ? (
    <KmzStateMessage
      icon={MapsIcon}
      title={t("list.errorTitle")}
      subtitle={t("list.errorSubtitle")}
      action={
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => void refetch()}>
          <HugeiconsIcon icon={RefreshIcon} className="size-4" />
          {t("common:actions.retry")}
        </Button>
      }
    />
  ) : files.length === 0 ? (
    <KmzStateMessage
      icon={MapsIcon}
      title={activeFilterCount > 0 ? t("list.filteredEmptyTitle") : t("list.emptyTitle")}
      subtitle={activeFilterCount > 0 ? t("list.filteredEmptySubtitle") : t("list.emptySubtitle")}
      action={activeFilterCount > 0 ? <ClearFiltersButton count={activeFilterCount} onClick={clearFilters} /> : undefined}
    />
  ) : (
    <div className="columns-1 gap-x-8 sm:columns-2 lg:columns-3">
      {files.map((file) => (
        <div key={file.filename} className="flex items-center gap-3 break-inside-avoid-column border-b border-border/60 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{getRegionLabel(file)}</p>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">{formatFileSize(file.size)}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => handleDownload(file)}
            disabled={downloadingFileName === file.filename}
          >
            {downloadingFileName === file.filename ? <Spinner /> : <HugeiconsIcon icon={Download01Icon} className="size-4.5" />}
            {downloadingFileName === file.filename ? t("list.downloading") : t("list.download")}
          </Button>
        </div>
      ))}
    </div>
  );

  return (
    <main className="custom-scrollbar flex-1 overflow-y-auto">
      <div className="w-full px-6 py-6">
        <header className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{t("page.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("page.subtitle")}</p>
          </div>
          <p className="shrink-0 text-sm font-medium text-muted-foreground">{t("list.count", { count: files.length })}</p>
        </header>

        <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-2">
            <div className={cn("flex flex-col gap-1", showFloatingMobileFilters && "max-md:hidden")}>
              <span className="text-xs font-medium text-muted-foreground">{t("type.label")}</span>
              <KmzTypeSwitcher type={type} onChange={handleTypeChange} />
            </div>

            <div
              className={cn(
                "flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end sm:border-l sm:border-border sm:pl-3",
                showFloatingMobileFilters && "max-md:hidden",
              )}
            >
              {type === "stations" ? (
                <div className="flex w-full flex-col gap-1 sm:w-44">
                  <span className="text-xs font-medium text-muted-foreground">{t("source.label")}</span>
                  <Select value={source} onValueChange={(value) => value && handleSourceChange(value as KmzSource)}>
                    <SelectTrigger className="h-8 w-full">
                      <SelectValue>{t(`source.${source}`)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {KMZ_SOURCES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`source.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className="flex w-full flex-col gap-1 sm:w-40">
                <span className="text-xs font-medium text-muted-foreground">{t("common:labels.date")}</span>
                <Select value={selectedDate ?? ""} onValueChange={(value) => value && setDate(value)}>
                  <SelectTrigger className="h-8 w-full" disabled={availableDates.length === 0}>
                    <SelectValue>{selectedDate ? formatDayMonthYear(selectedDate) : t("list.noDates")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {availableDates.map((value) => (
                      <SelectItem key={value} value={value}>
                        {formatDayMonthYear(value)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex w-full flex-col gap-1 sm:w-48">
                <span className="text-xs font-medium text-muted-foreground">{t("common:labels.region")}</span>
                <Select value={region ?? ALL_FILTER_VALUE} onValueChange={handleRegionChange}>
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue>{selectedRegion?.name ?? t("region.allRegions")}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_FILTER_VALUE}>{t("region.allRegions")}</SelectItem>
                    {regions.map((item) => (
                      <SelectItem key={item.id} value={item.code}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex w-full flex-col gap-1 sm:w-36">
                <span className="text-xs font-medium text-muted-foreground">{t("sortLabel")}</span>
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger className="h-8 w-full">
                    <SelectValue>{sortLabels[sortBy]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {KMZ_SORT_OPTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {sortLabels[value]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex w-full flex-col gap-1 sm:w-auto">
                <span className="text-xs font-medium text-muted-foreground">{t("orderLabel")}</span>
                <Button type="button" variant="outline" size="sm" className="h-8 w-full gap-2 sm:w-auto" onClick={toggleOrder}>
                  <HugeiconsIcon icon={order === "asc" ? ArrowUp01Icon : ArrowDown01Icon} className="size-4" />
                  {order === "asc" ? t("order.asc") : t("order.desc")}
                </Button>
              </div>
            </div>
          </div>

          {activeFilterCount > 0 ? (
            <div className={cn(showFloatingMobileFilters && "max-md:hidden")}>
              <ClearFiltersButton count={activeFilterCount} onClick={clearFilters} />
            </div>
          ) : null}
        </div>

        <div className="pt-5">{content}</div>
      </div>

      {showFloatingMobileFilters &&
        createPortal(
          <div className="flex items-center gap-1 max-md:w-[calc(100vw-1.5rem)] max-md:min-w-0 md:hidden">
            <div className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden md:hidden">
              <div className="w-max">
                <KmzMobileFilterRail
                  type={type}
                  source={source}
                  date={selectedDate}
                  region={region}
                  onTypeChange={handleTypeChange}
                  sortBy={sortBy}
                  order={order}
                  availableDates={availableDates}
                  regions={regions}
                  selectedRegion={selectedRegion}
                  activeFilterCount={activeFilterCount}
                  filesCount={files.length}
                  onSourceChange={handleSourceChange}
                  onDateChange={setDate}
                  onRegionChange={setRegion}
                  onSortByChange={setSortBy}
                  onOrderChange={setOrder}
                  onClearFilters={clearFilters}
                />
              </div>
            </div>
          </div>,
          navActionTarget,
        )}
    </main>
  );
}

export const Route = createFileRoute("/_layout/kmz")({
  component: KmzListPage,
});
