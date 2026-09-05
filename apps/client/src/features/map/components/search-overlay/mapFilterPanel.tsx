import {
  AirportTowerIcon,
  Database02Icon,
  File02Icon,
  FilterIcon,
  Fire02Icon,
  InformationCircleIcon,
  Navigation03Icon,
  Radar01Icon,
  Route02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Slider } from "@/components/ui/slider";
import type { UkeOperator } from "@/features/shared/api";
import { fetchUkeRadioLineOperators } from "@/features/shared/api";
import { FacetPill, FilterPanelSection, KbdHint, OperatorCheckboxGrid, sortBandsUnknownLast } from "@/features/shared/filterPanel";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import { StationStatusPills } from "@/features/stations/components/stationStatusFilter";
import { usePreferences } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";
import type { Operator, StationFilters, StationSource, StationStatus } from "@/types/station";

import { RAT_OPTIONS, UKE_RAT_OPTIONS } from "../../constants";
import { type StationFiltersUpdater, changeFilterSource } from "../../filterKeybinds";
import { type DataStats, fetchStats } from "../../statsApi";
import { Checkbox } from "./checkbox";

const PRIORITY_RADIOLINE_OPERATORS = ["T-Mobile Polska", "Towerlink Poland", "P4", "ORANGE POLSKA"];
const OPERATOR_KEYBINDS: Record<number, string> = { 26001: "1", 26002: "2", 26003: "3", 26006: "4" };
const RECENT_DATE_FIELDS: ("updatedAt" | "createdAt")[] = ["updatedAt", "createdAt"];
const RADIOLINE_CHIP_MAX_LENGTH = 12;

type LayerTileConfig = {
  key: string;
  label: string;
  icon: IconSvgElement;
  active: boolean;
  keybind: string;
  onToggle: () => void;
};

function LayerTiles({ layers }: { layers: LayerTileConfig[] }) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${layers.length}, minmax(0, 1fr))` }}>
      {layers.map((layer) => (
        <button
          key={layer.key}
          type="button"
          aria-pressed={layer.active}
          onMouseDown={(event) => event.preventDefault()}
          onClick={layer.onToggle}
          className={cn(
            "relative flex h-14 flex-col items-center justify-center gap-1.5 rounded-lg border px-0.5 text-[11px] font-medium leading-none outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
            layer.active
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30",
          )}
        >
          <span className="absolute top-1 left-1.5 hidden font-mono text-[9px] text-muted-foreground md:inline">{layer.keybind}</span>
          {layer.active ? <HugeiconsIcon icon={Tick02Icon} strokeWidth={2} className="absolute top-1 right-1 size-3" aria-hidden="true" /> : null}
          <HugeiconsIcon icon={layer.icon} className="size-4" aria-hidden="true" />
          <span className="max-w-full truncate">{layer.label}</span>
        </button>
      ))}
    </div>
  );
}

type RadiolineOperatorsSectionProps = {
  filters: StationFilters;
  operators: UkeOperator[];
  onFiltersChange: (update: StationFilters | StationFiltersUpdater) => void;
};

function RadiolineOperatorsSection({ filters, operators, onFiltersChange }: RadiolineOperatorsSectionProps) {
  const { t } = useTranslation(["main", "common"]);
  const chipsRef = useRef<HTMLDivElement>(null);
  const operatorById = useMemo(() => new Map(operators.map((operator) => [operator.id, operator])), [operators]);
  const selectedIds = filters.radiolineOperators;
  const selectedOperators = useMemo(
    () => selectedIds.map((id) => operatorById.get(id)).filter((operator): operator is UkeOperator => operator !== undefined),
    [operatorById, selectedIds],
  );

  return (
    <FilterPanelSection
      title={t("main:filters.radiolineOperator")}
      onClear={selectedIds.length > 0 ? () => onFiltersChange((current) => ({ ...current, radiolineOperators: [] })) : undefined}
    >
      <Combobox
        multiple
        value={selectedOperators}
        onValueChange={(values) => onFiltersChange((current) => ({ ...current, radiolineOperators: values.map((operator) => operator.id) }))}
        items={operators}
        itemToStringLabel={(operator) => operator.name}
        filter={(operator, query, itemToString) => {
          const needle = query.toLowerCase().trim();
          if (!needle) return true;
          const label = (itemToString?.(operator) ?? operator.name ?? "").toLowerCase();
          return label.includes(needle) || (operator.full_name ?? "").toLowerCase().includes(needle);
        }}
      >
        <ComboboxChips ref={chipsRef} className="custom-scrollbar max-h-24 min-h-8 overflow-x-hidden overflow-y-auto overscroll-contain text-sm">
          {selectedOperators.map((operator) => (
            <ComboboxChip key={operator.id} title={operator.name}>
              {operator.name.length > RADIOLINE_CHIP_MAX_LENGTH ? `${operator.name.slice(0, RADIOLINE_CHIP_MAX_LENGTH)}...` : operator.name}
            </ComboboxChip>
          ))}
          <ComboboxChipsInput className="text-sm" placeholder={selectedOperators.length === 0 ? t("main:filters.searchRadiolineOperators") : ""} />
        </ComboboxChips>
        <ComboboxContent anchor={chipsRef}>
          <ComboboxEmpty>{t("common:placeholder.noOperatorsFound")}</ComboboxEmpty>
          <ComboboxList>
            {(operator: UkeOperator) => (
              <ComboboxItem key={operator.id} value={operator}>
                <span>{operator.name}</span>
                {operator.full_name && operator.full_name !== operator.name ? (
                  <span className="ml-auto max-w-48 truncate text-xs text-muted-foreground" title={operator.full_name}>
                    {operator.full_name}
                  </span>
                ) : null}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </FilterPanelSection>
  );
}

type RecentDaysFilterProps = {
  filters: StationFilters;
  onRecentDaysChange: (days: number | null) => void;
  onRecentDateFieldChange: (fields: ("createdAt" | "updatedAt")[]) => void;
};

function RecentDaysFilter({ filters, onRecentDaysChange, onRecentDateFieldChange }: RecentDaysFilterProps) {
  const { t } = useTranslation("main");
  const [selectedDays, setSelectedDays] = useState(filters.recentDays ?? 30);
  const [syncedRecentDays, setSyncedRecentDays] = useState(filters.recentDays);
  const enabled = filters.recentDays !== null;
  const showDateFields = enabled && (filters.source === "internal" || filters.source === "uke");

  if (filters.recentDays !== syncedRecentDays) {
    setSyncedRecentDays(filters.recentDays);
    if (filters.recentDays !== null) setSelectedDays(filters.recentDays);
  }

  const handleCommit = useCallback(
    (value: number | readonly number[]) => {
      onRecentDaysChange(Array.isArray(value) ? value[0] : value);
    },
    [onRecentDaysChange],
  );

  return (
    <div className="space-y-1.5">
      <Checkbox checked={enabled} onChange={(checked) => onRecentDaysChange(checked ? selectedDays : null)}>
        <span className="flex-1 text-left">{t("filters.recentOnlyDays", { count: selectedDays })}</span>
      </Checkbox>
      {enabled ? (
        <div className="space-y-2 px-2">
          <div className="flex items-center gap-3">
            <Slider
              min={1}
              max={30}
              step={1}
              value={[selectedDays]}
              onValueChange={(value) => setSelectedDays(Array.isArray(value) ? value[0] : value)}
              onValueCommitted={handleCommit}
            />
            <span className="w-12 whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
              {t("filters.recentDaysValue", { count: selectedDays })}
            </span>
          </div>
          {showDateFields ? (
            <div className="flex items-center gap-1">
              {RECENT_DATE_FIELDS.map((field) => {
                const isActive = filters.recentDateFields.includes(field);
                return (
                  <button
                    type="button"
                    key={field}
                    aria-pressed={isActive}
                    onClick={() => {
                      if (isActive && filters.recentDateFields.length === 1) return;
                      onRecentDateFieldChange(
                        isActive ? filters.recentDateFields.filter((current) => current !== field) : [...filters.recentDateFields, field],
                      );
                    }}
                    className={cn(
                      "rounded-sm border px-1.5 py-px text-[11px] font-medium transition-colors",
                      isActive
                        ? "border-primary/30 bg-primary/5 text-primary dark:border-primary/20 dark:bg-primary/10"
                        : "border-transparent text-muted-foreground hover:bg-muted dark:hover:bg-muted/50",
                    )}
                  >
                    {t(`filters.date.${field}`)}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DataInfo({ stats, locale, className }: { stats: DataStats; locale: string; className?: string }) {
  const { t } = useTranslation(["main", "common"]);
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    [locale],
  );
  const formatDate = (value: string | null | undefined) => (value ? dateFormatter.format(new Date(value)) : t("common:status.never"));

  return (
    <div className={cn("space-y-0.5 text-[11px] leading-4 text-muted-foreground", className)}>
      <p className="flex items-center gap-1.5">
        <HugeiconsIcon icon={InformationCircleIcon} className="size-3 shrink-0" aria-hidden="true" />
        <span className="min-w-0 truncate">
          {t("main:stats.internalData")}: <span className="font-medium tabular-nums text-foreground">{formatDate(stats.lastUpdated.stations)}</span> ·{" "}
          {t("stationDetails:tabs.permits")}:{" "}
          <span className="font-medium tabular-nums text-foreground">{formatDate(stats.lastUpdated.stations_permits)}</span>
        </span>
      </p>
      <p className="pl-4.5">
        {t("main:stats.stations")}: <span className="font-medium tabular-nums text-foreground">{stats.counts.stations.toLocaleString(locale)}</span> ·{" "}
        {t("main:stats.permits")}: <span className="font-medium tabular-nums text-foreground">{stats.counts.uke_permits.toLocaleString(locale)}</span>
      </p>
    </div>
  );
}

type FilterPanelProps = {
  filters: StationFilters;
  operators: Operator[];
  uniqueBandValues: number[];
  activeFilterCount: number;
  onFiltersChange: (update: StationFilters | StationFiltersUpdater) => void;
  onToggleOperator: (mnc: number) => void;
  onToggleBand: (value: number) => void;
  onToggleRat: (rat: string) => void;
  onRecentDaysChange: (days: number | null) => void;
  onRecentDateFieldChange: (fields: ("createdAt" | "updatedAt")[]) => void;
  onToggleStatus: (status: StationStatus) => void;
  onClearAllRats: () => void;
  onClearAllBands: () => void;
  onClearFilters: () => void;
  showHeatmap?: boolean;
  onToggleHeatmap?: () => void;
  showPlannedMeasurements?: boolean;
  onTogglePlannedMeasurements?: () => void;
  isSheet?: boolean;
  hideSource?: boolean;
};

export function FilterPanel({
  filters,
  operators,
  uniqueBandValues,
  activeFilterCount,
  onFiltersChange,
  onToggleOperator,
  onToggleBand,
  onToggleRat,
  onRecentDaysChange,
  onRecentDateFieldChange,
  onToggleStatus,
  onClearAllRats,
  onClearAllBands,
  onClearFilters,
  showHeatmap = false,
  onToggleHeatmap,
  showPlannedMeasurements = false,
  onTogglePlannedMeasurements,
  isSheet = false,
  hideSource = false,
}: FilterPanelProps) {
  const { t, i18n } = useTranslation(["main", "common", "stations"]);
  const { preferences, updatePreferences } = usePreferences();

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: fetchStats,
    staleTime: 1000 * 60 * 5,
  });

  const { data: rawRadiolineOperators = [] } = useQuery({
    queryKey: ["uke", "radiolines", "operators"],
    queryFn: fetchUkeRadioLineOperators,
    staleTime: 1000 * 60 * 30,
    enabled: filters.showRadiolines,
  });

  const radiolineOperatorsList = useMemo(
    () =>
      [...rawRadiolineOperators].sort((left, right) => {
        const leftIndex = PRIORITY_RADIOLINE_OPERATORS.indexOf(left.name);
        const rightIndex = PRIORITY_RADIOLINE_OPERATORS.indexOf(right.name);
        if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
        if (leftIndex !== -1) return -1;
        if (rightIndex !== -1) return 1;
        return left.name.localeCompare(right.name);
      }),
    [rawRadiolineOperators],
  );

  const isDefaultStatus = filters.status.length === 1 && filters.status[0] === "published";
  const ratOptions = filters.source === "uke" ? UKE_RAT_OPTIONS : RAT_OPTIONS;
  const bandValues = useMemo(() => sortBandsUnknownLast(uniqueBandValues), [uniqueBandValues]);
  const dataSources: { id: StationSource; label: string; icon: typeof Database02Icon }[] = [
    { id: "internal", label: t("main:filters.internalDb"), icon: Database02Icon },
    { id: "uke", label: t("stationDetails:tabs.permits"), icon: File02Icon },
  ];

  const layers = [
    {
      key: "stations",
      label: t("main:filters.showStations"),
      icon: AirportTowerIcon,
      active: filters.showStations,
      keybind: "S",
      onToggle: () => onFiltersChange((current) => ({ ...current, showStations: !current.showStations })),
    },
    {
      key: "radiolines",
      label: t("main:filters.showRadiolines"),
      icon: Route02Icon,
      active: filters.showRadiolines,
      keybind: "R",
      onToggle: () => onFiltersChange((current) => ({ ...current, showRadiolines: !current.showRadiolines })),
    },
    onToggleHeatmap ? { key: "heatmap", label: "Heatmap", icon: Fire02Icon, active: showHeatmap, keybind: "H", onToggle: onToggleHeatmap } : null,
    onTogglePlannedMeasurements
      ? {
          key: "pem",
          label: t("main:filters.showPlannedPem"),
          icon: Radar01Icon,
          active: showPlannedMeasurements,
          keybind: "P",
          onToggle: onTogglePlannedMeasurements,
        }
      : null,
    {
      key: "azimuths",
      label: t("main:filters.showAzimuths"),
      icon: Navigation03Icon,
      active: preferences.showAzimuths,
      keybind: "A",
      onToggle: () => updatePreferences((current) => ({ showAzimuths: !current.showAzimuths })),
    },
  ].filter((layer): layer is LayerTileConfig => layer !== null);

  const ratKeybindHint = (
    <span className="hidden items-center gap-px md:inline-flex">
      <KbdHint>Shift</KbdHint>
      <span className="font-mono text-[10px] text-muted-foreground">{t("main:filters.ratKeybindHint")}</span>
    </span>
  );

  const filterSections = (
    <div className={cn("space-y-3 p-4", !isSheet ? "custom-scrollbar overflow-y-auto overscroll-contain" : null)}>
      <div className="space-y-3">
        <FilterPanelSection title={t("main:filters.layers")}>
          <LayerTiles layers={layers} />
        </FilterPanelSection>

        {!hideSource ? (
          <FilterPanelSection title={t("main:filters.dataSource")} hint={<KbdHint>Z</KbdHint>}>
            <ButtonGroup className="w-full">
              {dataSources.map((source) => {
                const isActive = filters.source === source.id;
                return (
                  <Button
                    key={source.id}
                    variant={isActive ? "default" : "outline"}
                    aria-pressed={isActive}
                    className={cn(
                      "flex-1",
                      isActive && source.id === "internal" ? "bg-emerald-700 text-white hover:bg-emerald-800" : null,
                      isActive && source.id === "uke" ? "bg-violet-600 text-white hover:bg-violet-700" : null,
                    )}
                    onClick={() => onFiltersChange((current) => changeFilterSource(current, source.id))}
                  >
                    <HugeiconsIcon icon={source.icon} className="size-4" />
                    <span>{source.label}</span>
                  </Button>
                );
              })}
            </ButtonGroup>
          </FilterPanelSection>
        ) : null}
      </div>

      <div className="space-y-3 border-t pt-3">
        <FilterPanelSection
          title={t("main:filters.operator")}
          onClear={filters.operators.length > 0 ? () => onFiltersChange((current) => ({ ...current, operators: [] })) : undefined}
        >
          <OperatorCheckboxGrid operators={operators} selectedMncs={filters.operators} onToggle={onToggleOperator} keybinds={OPERATOR_KEYBINDS} />
        </FilterPanelSection>

        {filters.showRadiolines && radiolineOperatorsList.length > 0 ? (
          <RadiolineOperatorsSection filters={filters} operators={radiolineOperatorsList} onFiltersChange={onFiltersChange} />
        ) : null}

        <FilterPanelSection title={t("common:labels.standard")} hint={ratKeybindHint} onClear={filters.rat.length > 0 ? onClearAllRats : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {ratOptions.map((rat) => {
              const isActive = filters.rat.includes(rat.value);
              return (
                <FacetPill key={rat.value} active={isActive} onClick={() => onToggleRat(rat.value)} className="pl-1.5">
                  <GenerationTag active={isActive}>{rat.gen}</GenerationTag>
                  <span>{rat.label}</span>
                </FacetPill>
              );
            })}
          </div>
        </FilterPanelSection>

        <FilterPanelSection title={`${t("common:labels.band")} (MHz)`} onClear={filters.bands.length > 0 ? onClearAllBands : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {bandValues.map((value) => (
              <FacetPill key={value} active={filters.bands.includes(value)} onClick={() => onToggleBand(value)} className="font-mono tabular-nums">
                {value === 0 ? t("stations:cells.unknownBand") : value}
              </FacetPill>
            ))}
          </div>
        </FilterPanelSection>

        {filters.source === "internal" ? (
          <FilterPanelSection
            title={t("main:filters.stationStatus")}
            onClear={!isDefaultStatus ? () => onFiltersChange((current) => ({ ...current, status: ["published"] })) : undefined}
          >
            <StationStatusPills statuses={filters.status} onToggleStatus={onToggleStatus} />
          </FilterPanelSection>
        ) : null}

        <FilterPanelSection
          title={t("main:filters.newOnly")}
          hint={<KbdHint>N</KbdHint>}
          onClear={filters.recentDays !== null ? () => onRecentDaysChange(null) : undefined}
        >
          <RecentDaysFilter filters={filters} onRecentDaysChange={onRecentDaysChange} onRecentDateFieldChange={onRecentDateFieldChange} />
        </FilterPanelSection>
      </div>

      {isSheet && stats ? <DataInfo stats={stats} locale={i18n.language} className="border-t pt-3" /> : null}
    </div>
  );

  if (isSheet) return filterSections;

  return (
    <div className="relative z-15 mt-2 flex max-h-[calc(100dvh-9rem)] flex-col overflow-hidden rounded-xl bg-background/95 shadow-md ring-1 ring-foreground/10 backdrop-blur-md animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="flex shrink-0 items-center gap-2 border-b bg-muted/30 px-4 py-2.5">
        <HugeiconsIcon icon={FilterIcon} className="size-4" aria-hidden="true" />
        <h3 className="text-sm font-medium">{t("common:labels.filters")}</h3>
        {activeFilterCount > 0 ? (
          <>
            <span
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-none text-primary-foreground"
              aria-label={t("common:labels.filtersActive", { count: activeFilterCount })}
            >
              {activeFilterCount}
            </span>
            <button type="button" onClick={onClearFilters} className="ml-auto text-xs text-muted-foreground transition-colors hover:text-foreground">
              {t("common:actions.clearAll")}
            </button>
          </>
        ) : null}
      </div>
      {filterSections}
      <div className="shrink-0 space-y-1 border-t bg-muted/30 px-4 py-2">
        {stats ? <DataInfo stats={stats} locale={i18n.language} /> : null}
        <p className="text-[11px] leading-4 text-muted-foreground">
          <Trans
            t={t}
            i18nKey="main:filters.toggleHint"
            components={{ kbd: <kbd className="rounded border border-border bg-muted px-1 py-0.5 font-mono text-[10px] text-foreground" /> }}
          />
        </p>
      </div>
    </div>
  );
}
