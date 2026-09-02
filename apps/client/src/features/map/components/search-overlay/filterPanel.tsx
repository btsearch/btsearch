import {
  AirportTowerIcon,
  ArrowDown01Icon,
  Database02Icon,
  File02Icon,
  FilterIcon,
  Fire02Icon,
  InformationCircleIcon,
  Navigation03Icon,
  Radar01Icon,
  Route02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { type Dispatch, type ReactNode, type RefObject, type SetStateAction, useCallback, useMemo, useRef, useState } from "react";
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
import { StationStatusFilter } from "@/features/stations/components/stationStatusFilter";
import { usePreferences } from "@/hooks/usePreferences";
import { TOP4_MNCS, getOperatorColor } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";
import type { Operator, StationFilters, StationSource, StationStatus } from "@/types/station";

import { RAT_OPTIONS, UKE_RAT_OPTIONS } from "../../constants";
import { changeFilterSource } from "../../filterKeybinds";
import { type DataStats, fetchStats } from "../../statsApi";
import { Checkbox } from "./checkbox";

const PRIORITY_RADIOLINE_OPERATORS = ["T-Mobile Polska", "Towerlink Poland", "P4", "ORANGE POLSKA"];

const OPERATOR_KEYBINDS: Record<number, string> = { 26001: "1", 26002: "2", 26003: "3", 26006: "4" };

function KbdHint({ children }: { children: ReactNode }) {
  return (
    <kbd className="ml-auto shrink-0 hidden md:inline-flex items-center px-1 py-0.5 rounded bg-muted font-mono text-[10px] border border-border text-foreground leading-none">
      {children}
    </kbd>
  );
}

type OperatorsSectionProps = {
  filters: StationFilters;
  topOperators: Operator[];
  otherOperators: Operator[];
  hasSelectedOther: boolean;
  showOtherOperators: boolean;
  setShowOtherOperators: Dispatch<SetStateAction<boolean>>;
  onToggleOperator: (mnc: number) => void;
  radiolineOperatorsList: UkeOperator[];
  radiolineOperatorsChipsRef: RefObject<HTMLDivElement | null>;
  onFiltersChange: (filters: StationFilters) => void;
};

function OperatorsSection({
  filters,
  topOperators,
  otherOperators,
  hasSelectedOther,
  showOtherOperators,
  setShowOtherOperators,
  onToggleOperator,
  radiolineOperatorsList,
  radiolineOperatorsChipsRef,
  onFiltersChange,
}: OperatorsSectionProps) {
  const { t } = useTranslation(["main", "common"]);
  const radiolineOpMap = useMemo(() => new Map(radiolineOperatorsList.map((o) => [o.id, o])), [radiolineOperatorsList]);

  const comboboxValue = useMemo(
    () =>
      (filters.radiolineOperators ?? [])
        .map((id) => radiolineOperatorsList.find((op) => op.id === id))
        .filter((op): op is UkeOperator => op !== undefined),
    [filters.radiolineOperators, radiolineOperatorsList],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("main:filters.operator")}</h4>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {topOperators.map((op) => (
          <Checkbox key={op.mnc} checked={filters.operators.includes(op.mnc)} onChange={() => onToggleOperator(op.mnc)}>
            <div className="size-3 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(op.mnc) }} />
            <span className="flex-1 text-left truncate">{op.name}</span>
            {OPERATOR_KEYBINDS[op.mnc] && <KbdHint>{OPERATOR_KEYBINDS[op.mnc]}</KbdHint>}
          </Checkbox>
        ))}
      </div>

      {otherOperators.length > 0 && (
        <div className="mt-1.5">
          <button
            type="button"
            onClick={() => setShowOtherOperators((prev) => !prev)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md px-1.5 py-1 transition-colors w-full"
          >
            <HugeiconsIcon icon={ArrowDown01Icon} className={cn("size-3.5 transition-transform", showOtherOperators && "rotate-180")} />
            <span>
              {t("common:labels.otherOperators", { count: otherOperators.length })}
              {hasSelectedOther &&
                ` (${t("common:labels.selected", { count: otherOperators.filter((op) => filters.operators.includes(op.mnc)).length })})`}
            </span>
          </button>

          {showOtherOperators && (
            <div className="grid grid-cols-2 gap-1 mt-1.5 pt-1.5 border-t border-border/50">
              {otherOperators.map((op) => (
                <Checkbox key={op.mnc} checked={filters.operators.includes(op.mnc)} onChange={() => onToggleOperator(op.mnc)}>
                  <div className="size-3 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(op.mnc) }} />
                  <span className="flex-1 text-left truncate">{op.name}</span>
                </Checkbox>
              ))}
            </div>
          )}
        </div>
      )}
      {filters.showRadiolines && radiolineOperatorsList?.length > 0 && (
        <div className="space-y-2 mt-1 pt-1">
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("filters.radiolineOperator")}</h4>
          <Combobox
            multiple
            value={comboboxValue}
            onValueChange={(values) => onFiltersChange({ ...filters, radiolineOperators: values.map((v) => v.id) })}
            items={radiolineOperatorsList}
            itemToStringLabel={(op) => op.name}
            filter={(op, query, itemToString) => {
              if (!query.trim()) return true;
              const q = query.toLowerCase().trim();
              const label = (itemToString?.(op) ?? op.name ?? "").toLowerCase();
              const full = (op.full_name ?? "").toLowerCase();
              return label.includes(q) || full.includes(q);
            }}
          >
            <ComboboxChips
              ref={radiolineOperatorsChipsRef}
              className="min-h-8 max-h-24 overflow-y-auto overflow-x-hidden text-sm overscroll-contain custom-scrollbar"
            >
              {(filters.radiolineOperators ?? []).map((id) => {
                const op = radiolineOpMap.get(id);
                if (!op) return null;
                const maxLen = 12;
                const label = op.name.length > maxLen ? `${op.name.slice(0, maxLen)} ....` : op.name;
                return (
                  <ComboboxChip key={id} title={op.name}>
                    {label}
                  </ComboboxChip>
                );
              })}
              <ComboboxChipsInput
                className="text-sm"
                placeholder={(filters.radiolineOperators ?? []).length === 0 ? t("filters.searchRadiolineOperators") : ""}
              />
            </ComboboxChips>
            <ComboboxContent anchor={radiolineOperatorsChipsRef}>
              <ComboboxEmpty>{t("common:placeholder.noOperatorsFound")}</ComboboxEmpty>
              <ComboboxList>
                {(op: UkeOperator) => (
                  <ComboboxItem key={op.id} value={op}>
                    <span>{op.name}</span>
                    {op.full_name && op.full_name !== op.name && (
                      <span className="text-muted-foreground text-xs ml-auto truncate max-w-48" title={op.full_name}>
                        {op.full_name}
                      </span>
                    )}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      )}
    </div>
  );
}

type StatsSectionProps = {
  stats: DataStats;
  locale: string;
};

function StatsSection({ stats, locale }: StatsSectionProps) {
  const { t } = useTranslation(["main", "common"]);
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    [locale],
  );

  return (
    <div className="pt-2 border-t">
      <div className="flex items-center gap-1.5 mb-1.5">
        <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5 text-muted-foreground" />
        <h4 className="text-xs font-medium text-muted-foreground">{t("stats.dataInfo")}</h4>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("stats.internalData")}:</span>
          <span className="font-medium tabular-nums">
            {stats.lastUpdated.stations ? dateFormatter.format(new Date(stats.lastUpdated.stations)) : t("common:status.never")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("stationDetails:tabs.permits")}:</span>
          <span className="font-medium tabular-nums">
            {stats.lastUpdated.stations_permits ? dateFormatter.format(new Date(stats.lastUpdated.stations_permits)) : t("common:status.never")}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("stats.stations")}:</span>
          <span className="font-medium tabular-nums">{stats.counts.stations.toLocaleString(locale)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("stats.permits")}:</span>
          <span className="font-medium tabular-nums">{stats.counts.uke_permits.toLocaleString(locale)}</span>
        </div>
      </div>
    </div>
  );
}

type RecentDaysFilterProps = {
  filters: StationFilters;
  onRecentDaysChange: (days: number | null) => void;
  onRecentDateFieldChange: (fields: ("createdAt" | "updatedAt")[]) => void;
};

const DateFieldOptions: { label: string; value: "createdAt" | "updatedAt"; key: string }[] = [
  { label: "Updated", value: "updatedAt", key: "U" },
  { label: "Created", value: "createdAt", key: "C" },
];

function RecentDaysFilter({ filters, onRecentDaysChange, onRecentDateFieldChange }: RecentDaysFilterProps) {
  const { t } = useTranslation("main");
  const [localDays, setLocalDays] = useState(filters.recentDays ?? 30);

  const handleCommit = useCallback(
    (value: number | readonly number[]) => onRecentDaysChange(Array.isArray(value) ? value[0] : value),
    [onRecentDaysChange],
  );

  return (
    <div>
      <div className="flex items-center gap-1">
        <Checkbox
          checked={filters.recentDays !== null}
          onChange={(checked) => {
            if (checked) onRecentDaysChange(localDays);
            else onRecentDaysChange(null);
          }}
        >
          <span className="flex-1 text-left">{t("filters.newOnly")}</span>
          <KbdHint>N</KbdHint>
        </Checkbox>
        {filters.recentDays !== null && (filters.source === "internal" || filters.source === "uke") && (
          <>
            <div className="w-px h-3.5 bg-border shrink-0" />
            <div className="flex gap-1 shrink-0">
              {DateFieldOptions.map((op) => {
                const isActive = filters.recentDateFields.includes(op.value);
                return (
                  <button
                    type="button"
                    key={op.value}
                    onClick={() => {
                      if (isActive && filters.recentDateFields.length === 1) return;
                      onRecentDateFieldChange(
                        isActive ? filters.recentDateFields.filter((field) => field !== op.value) : [...filters.recentDateFields, op.value],
                      );
                    }}
                    className={cn(
                      "relative px-1.5 py-px rounded-sm text-[11px] font-medium transition-all border after:absolute after:inset-x-0 after:-inset-y-2",
                      isActive
                        ? "bg-primary/5 border-primary/30 text-primary dark:bg-primary/10 dark:border-primary/20"
                        : "border-transparent text-muted-foreground hover:bg-muted dark:hover:bg-muted/50",
                    )}
                  >
                    {t(`filters.date.${op.value}`)}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      {filters.recentDays !== null && (
        <div className="flex items-center gap-3 px-2 pt-1.5 pb-0.5">
          <Slider
            min={1}
            max={30}
            step={1}
            value={[localDays]}
            onValueChange={(value) => setLocalDays(Array.isArray(value) ? value[0] : value)}
            onValueCommitted={handleCommit}
          />
          <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap w-12 text-right">
            {t("filters.recentDaysValue", { count: localDays })}
          </span>
        </div>
      )}
    </div>
  );
}

type FilterPanelProps = {
  filters: StationFilters;
  operators: Operator[];
  uniqueBandValues: number[];
  activeFilterCount: number;
  onFiltersChange: (filters: StationFilters) => void;
  onToggleOperator: (mnc: number) => void;
  onToggleBand: (value: number) => void;
  onToggleRat: (rat: string) => void;
  onRecentDaysChange: (days: number | null) => void;
  onRecentDateFieldChange: (fields: ("createdAt" | "updatedAt")[]) => void;
  onToggleStatus: (status: StationStatus) => void;
  onSelectAllRats: () => void;
  onClearAllRats: () => void;
  onSelectAllBands: () => void;
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
  onSelectAllRats,
  onClearAllRats,
  onSelectAllBands,
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
  const [showOtherOperators, setShowOtherOperators] = useState(false);

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

  const radiolineOperatorsList = useMemo(() => {
    return [...rawRadiolineOperators].sort((a, b) => {
      const ai = PRIORITY_RADIOLINE_OPERATORS.indexOf(a.name);
      const bi = PRIORITY_RADIOLINE_OPERATORS.indexOf(b.name);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [rawRadiolineOperators]);

  const radiolineOperatorsChipsRef = useRef<HTMLDivElement>(null);

  const topOperators = useMemo(
    () => operators.filter((op) => TOP4_MNCS.includes(op.mnc)).sort((a, b) => TOP4_MNCS.indexOf(a.mnc) - TOP4_MNCS.indexOf(b.mnc)),
    [operators],
  );
  const otherOperators = useMemo(() => operators.filter((op) => !TOP4_MNCS.includes(op.mnc)), [operators]);
  const hasSelectedOther = useMemo(() => otherOperators.some((op) => filters.operators.includes(op.mnc)), [otherOperators, filters.operators]);

  const dataSources = [
    { id: "internal", label: t("filters.internalDb"), icon: Database02Icon },
    { id: "uke", label: t("stationDetails:tabs.permits"), icon: File02Icon },
  ];

  const handleToggleStations = useCallback(() => {
    onFiltersChange({ ...filters, showStations: !filters.showStations });
  }, [filters, onFiltersChange]);

  const handleToggleRadiolines = useCallback(() => {
    onFiltersChange({ ...filters, showRadiolines: !filters.showRadiolines });
  }, [filters, onFiltersChange]);

  const handleToggleHeatmap = useCallback(() => {
    onToggleHeatmap?.();
  }, [onToggleHeatmap]);

  const handleTogglePlannedMeasurements = useCallback(() => {
    onTogglePlannedMeasurements?.();
  }, [onTogglePlannedMeasurements]);

  const filterSections = (
    <div className={cn("space-y-2", isSheet ? "p-4" : "p-4 overflow-y-auto overscroll-contain")}>
      <div>
        <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">{t("filters.layers")}</h4>
        <div className="grid grid-cols-2 gap-1">
          <Checkbox checked={filters.showStations} onChange={handleToggleStations}>
            <HugeiconsIcon icon={AirportTowerIcon} className="size-3.5 shrink-0" />
            <span className="flex-1 text-left">{t("filters.showStations")}</span>
            <KbdHint>S</KbdHint>
          </Checkbox>
          <Checkbox checked={filters.showRadiolines} onChange={handleToggleRadiolines}>
            <HugeiconsIcon icon={Route02Icon} className="size-3.5 shrink-0" />
            <span className="flex-1 text-left">{t("filters.showRadiolines")}</span>
            <KbdHint>R</KbdHint>
          </Checkbox>
          {onToggleHeatmap ? (
            <Checkbox checked={showHeatmap} onChange={handleToggleHeatmap}>
              <HugeiconsIcon icon={Fire02Icon} className="size-3.5 shrink-0" />
              <span className="flex-1 text-left">Heatmap</span>
              <KbdHint>H</KbdHint>
            </Checkbox>
          ) : null}
          {onTogglePlannedMeasurements ? (
            <Checkbox checked={showPlannedMeasurements} onChange={handleTogglePlannedMeasurements}>
              <HugeiconsIcon icon={Radar01Icon} className="size-3.5 shrink-0" />
              <span className="flex-1 text-left">{t("main:filters.showPlannedPem")}</span>
              <KbdHint>P</KbdHint>
            </Checkbox>
          ) : null}
          <Checkbox checked={preferences.showAzimuths} onChange={() => updatePreferences((current) => ({ showAzimuths: !current.showAzimuths }))}>
            <HugeiconsIcon icon={Navigation03Icon} className="size-3.5 shrink-0" />
            <span className="flex-1 text-left">{t("filters.showAzimuths")}</span>
            <KbdHint>A</KbdHint>
          </Checkbox>
        </div>
      </div>

      {!hideSource && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("filters.dataSource")}</h4>
            <KbdHint>Z</KbdHint>
          </div>
          <ButtonGroup className="w-full">
            {dataSources.map((src) => (
              <Button
                key={src.id}
                variant={filters.source === src.id ? "default" : "outline"}
                className={cn(
                  "flex-1",
                  filters.source === src.id && src.id === "internal" && "bg-emerald-700 hover:bg-emerald-800 text-white",
                  filters.source === src.id && src.id === "uke" && "bg-violet-600 hover:bg-violet-700 text-white",
                )}
                onClick={() => {
                  const newSource = src.id as StationSource;
                  onFiltersChange(changeFilterSource(filters, newSource));
                }}
              >
                <HugeiconsIcon icon={src.icon} className="size-4" />
                <span>{src.label}</span>
              </Button>
            ))}
          </ButtonGroup>
        </div>
      )}

      <RecentDaysFilter filters={filters} onRecentDaysChange={onRecentDaysChange} onRecentDateFieldChange={onRecentDateFieldChange} />
      <StationStatusFilter filters={filters} onToggleStatus={onToggleStatus} />

      <OperatorsSection
        filters={filters}
        topOperators={topOperators}
        otherOperators={otherOperators}
        hasSelectedOther={hasSelectedOther}
        showOtherOperators={showOtherOperators}
        setShowOtherOperators={setShowOtherOperators}
        onToggleOperator={onToggleOperator}
        radiolineOperatorsList={radiolineOperatorsList}
        radiolineOperatorsChipsRef={radiolineOperatorsChipsRef}
        onFiltersChange={onFiltersChange}
      />
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("common:labels.standard")}</h4>
            <span className="hidden md:inline-flex items-center gap-px">
              <kbd className="inline-flex items-center px-1 py-0.5 rounded bg-muted font-mono text-[10px] border border-border text-foreground leading-none">
                Shift
              </kbd>
              <span className="text-[10px] text-muted-foreground font-mono">{t("filters.ratKeybindHint")}</span>
            </span>
          </div>
          <div className="flex gap-1">
            <button type="button" onClick={onSelectAllRats} className="text-xs text-primary underline-offset-4 hover:underline">
              {t("common:status.all")}
            </button>
            <span className="text-muted-foreground">/</span>
            <button
              type="reset"
              onClick={onClearAllRats}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              {t("common:labels.none")}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {(filters.source === "uke" ? UKE_RAT_OPTIONS : RAT_OPTIONS).map((rat) => {
            const isActive = filters.rat.includes(rat.value);
            return (
              <button
                type="button"
                key={rat.value}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onToggleRat(rat.value)}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium transition-all border",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : "border-border bg-background hover:bg-muted text-foreground dark:bg-input/30 dark:border-input",
                )}
              >
                <span className={cn("text-xs", isActive ? "text-primary-foreground/70" : "text-muted-foreground")}>{rat.gen}</span>
                <span>{rat.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{t("common:labels.band")} (MHz)</h4>
          <div className="flex gap-1">
            <button type="button" onClick={onSelectAllBands} className="text-xs text-primary underline-offset-4 hover:underline">
              {t("common:status.all")}
            </button>
            <span className="text-muted-foreground">/</span>
            <button
              type="reset"
              onClick={onClearAllBands}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              {t("common:labels.none")}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {uniqueBandValues.map((value) => (
            <button
              type="button"
              key={value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onToggleBand(value)}
              className={cn(
                "px-2.5 py-0.5 rounded-full text-xs font-mono transition-all border",
                filters.bands.includes(value)
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "border-border bg-background hover:bg-muted text-foreground dark:bg-input/30 dark:border-input",
              )}
            >
              {value === 0 ? t("stations:cells.unknownBand") : value}
            </button>
          ))}
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{t("common:labels.filtersActive", { count: activeFilterCount })}</span>
            {filters.operators.length > 0 && <> · {t("common:labels.operators", { count: filters.operators.length })}</>}
            {filters.showRadiolines && (filters.radiolineOperators?.length ?? 0) > 0 && (
              <> · {t("filters.radiolineOperators", { count: filters.radiolineOperators?.length ?? 0 })}</>
            )}
            {filters.rat.length > 0 && <> · {t("common:labels.standard", { count: filters.rat.length })}</>}
            {filters.bands.length > 0 && <> · {t("common:labels.bands", { count: filters.bands.length })}</>}
          </p>
        </div>
      )}

      {stats && <StatsSection stats={stats} locale={i18n.language} />}
    </div>
  );

  if (isSheet) return filterSections;

  return (
    <div className="mt-2 bg-background/95 backdrop-blur-md ring-1 ring-foreground/10 rounded-xl shadow-md overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 relative z-15 max-h-[calc(100vh-10rem)] flex flex-col">
      <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center gap-2 shrink-0">
        <HugeiconsIcon icon={FilterIcon} className="size-4" />
        <h3 className="font-medium text-sm">{t("common:labels.filters")}</h3>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors text-right ml-auto"
          >
            {t("common:actions.clearAll")}
          </button>
        )}
      </div>
      {filterSections}
      <div className="px-4 py-1.5 border-t bg-muted/30">
        <p className="text-[11px] text-muted-foreground">
          <Trans
            t={t}
            i18nKey="filters.toggleHint"
            components={{ kbd: <kbd className="px-1 py-0.5 rounded bg-muted font-mono text-[10px] border border-border text-foreground" /> }}
          />
        </p>
      </div>
    </div>
  );
}
