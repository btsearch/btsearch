import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { registerBandsQueryOptions } from "../../api";
import { RAT_OPTIONS } from "../../constants";
import {
  DEFAULT_RECENT_DAYS,
  IOT_RAT,
  type MapFilters,
  type MapFiltersChange,
  type MapRecentDateField,
  UNKNOWN_BAND_LABEL,
  listAppliedMapBands,
  listAppliedMapRats,
} from "../../data/mapFilters";
import { type MapLookups, useCountryBandPlans } from "../../data/mapLookups";
import { Checkbox } from "./checkbox";
import { FadeItem, Reveal, SmoothHeight } from "./mapFilterMotion";
import { type BandPill, listBandPills } from "./mapFilterPanelRules";
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
import { InlineError } from "@/components/ui/error-state";
import { Slider } from "@/components/ui/slider";
import { type UkeOperator, fetchUkeRadioLineOperators } from "@/features/shared/api";
import { FacetCountryMark, FacetPill, FilterPanelSection, KbdHint } from "@/features/shared/filterPanel";
import { type RatOption, listRegisterRatOptions, toRegisterRatOption } from "@/features/shared/rat";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import { formatBandMhzLabel, isBandLabelInGhz } from "@/features/station-details/station/utils/bands";
import { UPLINK_APPEARANCE, UPLINK_TYPES, uplinkTypeKey } from "@/lib/format/uplink";
import { getCountryName } from "@/lib/geo/countryName";
import { hasFailedLoad } from "@/lib/queryLoadState";
import { cn, toggleValue } from "@/lib/utils";

type RadiolineOperators = {
  operators: UkeOperator[];
  isError: boolean;
  isRetrying: boolean;
  retry: () => unknown;
};

type RadiolineOperatorsSectionProps = {
  filters: MapFilters;
  operators: UkeOperator[];
  hasOperatorsError: boolean;
  isRetryingOperators: boolean;
  onRetryOperators: () => unknown;
  onFiltersChange: (update: MapFiltersChange) => void;
};

type StandardSectionProps = {
  filters: MapFilters;
  onToggleRat: (rat: string) => void;
  onClearAllRats: () => void;
  hasKeyHint?: boolean;
};

type BandSectionProps = {
  filters: MapFilters;
  facetCountryCodes: readonly string[];
  lookups: MapLookups | undefined;
  onToggleBand: (label: number) => void;
  onClearAllBands: () => void;
};

type BandFacetPillProps = {
  pill: BandPill;
  isActive: boolean;
  onToggleBand: (label: number) => void;
};

type UplinkSectionProps = {
  filters: MapFilters;
  onFiltersChange: (update: MapFiltersChange) => void;
};

type RecentDaysFilterProps = {
  filters: MapFilters;
  onRecentDaysChange: (days: number | null) => void;
  onRecentDateFieldChange: (fields: MapRecentDateField[]) => void;
};

const PRIORITY_RADIOLINE_OPERATORS = ["T-Mobile Polska", "Towerlink Poland", "P4", "ORANGE POLSKA"];
const RECENT_DATE_FIELDS: MapRecentDateField[] = ["updatedAt", "createdAt"];
const RADIOLINE_CHIP_MAX_LENGTH = 12;
const RADIOLINE_OPERATORS_STALE_TIME = 1000 * 60 * 30;
const NO_RADIOLINE_OPERATORS: UkeOperator[] = [];

function compareRadiolineOperators(left: UkeOperator, right: UkeOperator): number {
  const leftIndex = PRIORITY_RADIOLINE_OPERATORS.indexOf(left.name);
  const rightIndex = PRIORITY_RADIOLINE_OPERATORS.indexOf(right.name);
  if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
  if (leftIndex !== -1) return -1;
  if (rightIndex !== -1) return 1;
  return left.name.localeCompare(right.name);
}

export function useRadiolineOperators(isLayerShown: boolean): RadiolineOperators {
  const operatorsQuery = useQuery({
    queryKey: ["uke", "radiolines", "operators"],
    queryFn: fetchUkeRadioLineOperators,
    staleTime: RADIOLINE_OPERATORS_STALE_TIME,
    enabled: isLayerShown,
  });
  const isError = hasFailedLoad(operatorsQuery);
  const isRetrying = isError && operatorsQuery.isFetching;
  const loadedOperators = operatorsQuery.data ?? NO_RADIOLINE_OPERATORS;
  const operators = useMemo(() => [...loadedOperators].sort(compareRadiolineOperators), [loadedOperators]);

  return { operators, isError, isRetrying, retry: operatorsQuery.refetch };
}

export function RadiolineOperatorsSection({
  filters,
  operators,
  hasOperatorsError,
  isRetryingOperators,
  onRetryOperators,
  onFiltersChange,
}: RadiolineOperatorsSectionProps) {
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
      {hasOperatorsError ? (
        <InlineError size="sm" onRetry={onRetryOperators} isRetrying={isRetryingOperators} />
      ) : (
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
            <ComboboxChipsInput
              aria-label={t("main:filters.radiolineOperator")}
              className="text-sm"
              placeholder={selectedOperators.length === 0 ? t("main:filters.searchRadiolineOperators") : ""}
            />
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
      )}
    </FilterPanelSection>
  );
}

export function StandardSection({ filters, onToggleRat, onClearAllRats, hasKeyHint = true }: StandardSectionProps) {
  const { t } = useTranslation(["main", "common"]);
  const isDatabaseSource = filters.source === "internal";
  const registerRatsQuery = useQuery({ ...registerBandsQueryOptions(), select: listRegisterRatOptions, enabled: !isDatabaseSource });
  const ratOptions: readonly RatOption[] = isDatabaseSource
    ? RAT_OPTIONS
    : (registerRatsQuery.data ?? filters.rat.map((value) => ({ ...toRegisterRatOption(value), value })));
  const isError = !isDatabaseSource && hasFailedLoad(registerRatsQuery);
  const hasAppliedRats = listAppliedMapRats(filters).length > 0;

  return (
    <FilterPanelSection
      title={t("common:labels.standard")}
      hint={
        hasKeyHint ? (
          <span className="hidden items-center gap-px md:inline-flex">
            <KbdHint>Shift</KbdHint>
            <span className="font-mono text-[10px] text-muted-foreground">{t("main:filters.ratKeybindHint")}</span>
          </span>
        ) : undefined
      }
      onClear={hasAppliedRats ? onClearAllRats : undefined}
    >
      <Reveal shown={isError} className="pb-1.5">
        <InlineError size="sm" onRetry={() => registerRatsQuery.refetch()} isRetrying={registerRatsQuery.isFetching} />
      </Reveal>
      <SmoothHeight contentClassName="flex flex-wrap items-center gap-1.5">
        <AnimatePresence initial={false}>
          {ratOptions.flatMap((rat) => {
            const isActive = filters.rat.includes(rat.value);
            const pill = (
              <FadeItem key={rat.value}>
                <FacetPill active={isActive} onClick={() => onToggleRat(rat.value)} className="pl-1.5">
                  {rat.gen === null ? null : <GenerationTag active={isActive}>{rat.gen}</GenerationTag>}
                  <span>{rat.label}</span>
                </FacetPill>
              </FadeItem>
            );
            if (!isDatabaseSource || rat.value !== IOT_RAT) return [pill];

            return [
              <FadeItem key="iot-divider" className="items-center">
                <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-border" />
              </FadeItem>,
              pill,
            ];
          })}
        </AnimatePresence>
      </SmoothHeight>
    </FilterPanelSection>
  );
}

function BandFacetPill({ pill, isActive, onToggleBand }: BandFacetPillProps) {
  const { t, i18n } = useTranslation(["main", "stations"]);
  const { label, markCountryCode } = pill;

  if (label === UNKNOWN_BAND_LABEL) {
    return (
      <FacetPill active={isActive} label={t("main:filters.unknownBand")} onClick={() => onToggleBand(label)} className="font-mono tabular-nums">
        {t("stations:cells.unknownBand")}
      </FacetPill>
    );
  }

  const shownLabel = formatBandMhzLabel(label, i18n.language);
  const isInGhz = isBandLabelInGhz(label);

  if (markCountryCode === null) {
    return (
      <FacetPill
        active={isActive}
        label={isInGhz ? shownLabel : t("main:filters.bandMhz", { value: label })}
        onClick={() => onToggleBand(label)}
        className="font-mono tabular-nums"
      >
        {shownLabel}
      </FacetPill>
    );
  }

  const country = getCountryName(markCountryCode, i18n.language);

  return (
    <FacetPill
      active={isActive}
      label={isInGhz ? t("main:filters.bandGhzOnlyIn", { value: shownLabel, country }) : t("main:filters.bandOnlyIn", { value: label, country })}
      onClick={() => onToggleBand(label)}
      className="gap-[5px] pr-1.5 font-mono tabular-nums"
    >
      <span>{shownLabel}</span>
      <FacetCountryMark countryCode={markCountryCode} isActive={isActive} />
    </FacetPill>
  );
}

export function BandSection({ filters, facetCountryCodes, lookups, onToggleBand, onClearAllBands }: BandSectionProps) {
  const { t } = useTranslation("common");
  const { labelsByCountry, isError, isRetrying, retry } = useCountryBandPlans(facetCountryCodes, filters.source, lookups);
  const bandPills = listBandPills(filters, facetCountryCodes, labelsByCountry);
  const hasAppliedBands = listAppliedMapBands(filters).length > 0;

  return (
    <FilterPanelSection title={`${t("labels.band")} (MHz)`} onClear={hasAppliedBands ? onClearAllBands : undefined}>
      <Reveal shown={isError} className="pb-1.5">
        <InlineError size="sm" onRetry={retry} isRetrying={isRetrying} />
      </Reveal>
      <SmoothHeight contentClassName="flex flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {bandPills.map((pill) => (
            <FadeItem key={pill.label}>
              <BandFacetPill pill={pill} isActive={filters.bands.includes(pill.label)} onToggleBand={onToggleBand} />
            </FadeItem>
          ))}
        </AnimatePresence>
      </SmoothHeight>
    </FilterPanelSection>
  );
}

export function UplinkSection({ filters, onFiltersChange }: UplinkSectionProps) {
  const { t } = useTranslation("common");

  return (
    <FilterPanelSection
      title="Uplink"
      onClear={filters.uplinkTypes.length > 0 ? () => onFiltersChange((current) => ({ ...current, uplinkTypes: [] })) : undefined}
    >
      <div className="flex flex-wrap gap-1.5">
        {UPLINK_TYPES.map((type) => {
          const isActive = filters.uplinkTypes.includes(type);
          const { icon, iconClassName } = UPLINK_APPEARANCE[type];
          return (
            <FacetPill
              key={type}
              active={isActive}
              onClick={() => onFiltersChange((current) => ({ ...current, uplinkTypes: toggleValue(current.uplinkTypes, type) }))}
            >
              <HugeiconsIcon icon={icon} className={cn("size-3 shrink-0", isActive ? null : iconClassName)} aria-hidden="true" />
              <span>{t(`labels.${uplinkTypeKey(type)}`)}</span>
            </FacetPill>
          );
        })}
      </div>
    </FilterPanelSection>
  );
}

export function RecentDaysFilter({ filters, onRecentDaysChange, onRecentDateFieldChange }: RecentDaysFilterProps) {
  const { t } = useTranslation("main");
  const [selectedDays, setSelectedDays] = useState(filters.recentDays ?? DEFAULT_RECENT_DAYS);
  const [syncedRecentDays, setSyncedRecentDays] = useState(filters.recentDays);
  const enabled = filters.recentDays !== null;

  if (filters.recentDays !== syncedRecentDays) {
    setSyncedRecentDays(filters.recentDays);
    if (filters.recentDays !== null) setSelectedDays(filters.recentDays);
  }

  function handleCommit(value: number | readonly number[]) {
    onRecentDaysChange(Array.isArray(value) ? value[0] : value);
  }

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
                    "cursor-pointer rounded-sm border px-1.5 py-px text-[11px] font-medium transition-colors",
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
        </div>
      ) : null}
    </div>
  );
}
