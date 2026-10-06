import { FilterIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { MapCountries } from "../../data/mapCountries";
import { DEFAULT_MAP_FILTERS, type MapFilters, type MapFiltersChange, isDefaultMapStatus } from "../../data/mapFilters";
import { useMapLookups } from "../../data/mapLookups";
import { useFilterHandlers } from "../../hooks/useFilterHandlers";
import { countryStatisticsQueryOptions, readMapDataDates } from "../../statsApi";
import { FilterLayerStrip } from "./mapFilterLayerStrip";
import { FadeItem, Reveal, SmoothHeight } from "./mapFilterMotion";
import { FilterNote } from "./mapFilterNote";
import { OperatorRowsSection } from "./mapFilterOperatorRows";
import {
  hasCountryFacet,
  hasRegisterSourceNote,
  listBandFacetCountryCodes,
  listCountryPillCodes,
  splitCountryPillCodes,
} from "./mapFilterPanelRules";
import { BandSection, RadiolineOperatorsSection, RecentDaysFilter, StandardSection, UplinkSection, useRadiolineOperators } from "./mapFilterSections";
import { SourceSwitch } from "@/components/cellular/sourceSwitch";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FILTER_CLEAR_ALL_CLASS,
  FILTER_COUNT_BADGE_CLASS,
  FacetDisclosurePill,
  FacetPill,
  FilterPanelSection,
  KbdHint,
} from "@/features/shared/filterPanel";
import { StationStatusPills } from "@/features/stations/components/stationStatusFilter";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";
import type { StationSource } from "@/types/station";

type FilterPanelProps = {
  isSheet: boolean;
  filters: MapFilters;
  mapCountries: MapCountries;
  onFiltersChange: (update: MapFiltersChange) => void;
  onSourceChange: (source: StationSource) => void;
  onToggleHeatmap?: () => void;
  onTogglePlannedMeasurements?: () => void;
};

type PanelHeadingProps = {
  isSheet: boolean;
  activeFilterCount: number;
  hasSourceSwitch: boolean;
  source: StationSource;
  countryCodes: readonly string[];
  onClearFilters: () => void;
  onSourceChange: (source: StationSource) => void;
};

type DatedSourceSwitchProps = Pick<PanelHeadingProps, "source" | "countryCodes" | "onSourceChange">;

type DatedSource = {
  source: StationSource;
  label: string;
  date: string | null;
};

type CountrySectionProps = {
  filters: MapFilters;
  countryPillCodes: readonly string[];
  isExpanded: boolean;
  onToggleCountry: (countryCode: string) => void;
  onToggleExpanded: () => void;
  onFiltersChange: (update: MapFiltersChange) => void;
};

type CountryPillProps = {
  countryCode: string;
  isActive: boolean;
  onToggleCountry: (countryCode: string) => void;
};

const DATA_DATE_FORMAT: Intl.DateTimeFormatOptions = { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" };
const FILTER_SECTIONS_CLASS = "min-h-0 overflow-y-auto overscroll-contain px-4 pt-3.5 pb-4 [&_button]:cursor-pointer";
const SECTION_SLOT_CLASS = "pt-0.5 pb-2.5";

function formatDataDate(instant: string, language: string): string {
  return new Date(instant).toLocaleString(language, DATA_DATE_FORMAT);
}

function DatedSourceSwitch({ source, countryCodes, onSourceChange }: DatedSourceSwitchProps) {
  const { t, i18n } = useTranslation(["main", "common"]);
  const { data: statistics } = useQuery(countryStatisticsQueryOptions());
  const dates = readMapDataDates(statistics, countryCodes);
  const datedSources: DatedSource[] = [
    { source: "internal", label: t("main:stats.internalData"), date: dates.database },
    { source: "uke", label: t("common:labels.ukePermits"), date: dates.register },
  ];

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex" />}>
        <SourceSwitch source={source} onSourceChange={onSourceChange} alwaysLabeled keepsFocusInPlace />
      </TooltipTrigger>
      {statistics === undefined ? null : (
        <TooltipContent side="bottom">
          {datedSources.map((entry) => (
            <p key={entry.source} className={entry.source === source ? "font-semibold" : undefined}>
              {entry.label}:{" "}
              <span className="tabular-nums">{entry.date === null ? t("common:status.never") : formatDataDate(entry.date, i18n.language)}</span>
            </p>
          ))}
        </TooltipContent>
      )}
    </Tooltip>
  );
}

function PanelHeading({ isSheet, activeFilterCount, hasSourceSwitch, source, countryCodes, onClearFilters, onSourceChange }: PanelHeadingProps) {
  const { t } = useTranslation("common");

  return (
    <>
      {isSheet ? (
        <SheetTitle className="flex items-center gap-2 text-sm">
          <HugeiconsIcon icon={FilterIcon} className="size-4 shrink-0" aria-hidden="true" />
          <span>{t("labels.filters")}</span>
        </SheetTitle>
      ) : (
        <h3 className="text-xs font-medium text-muted-foreground">{t("labels.filters")}</h3>
      )}
      {activeFilterCount > 0 ? (
        <>
          {isSheet ? (
            <span className={FILTER_COUNT_BADGE_CLASS} aria-label={t("labels.filtersActive", { count: activeFilterCount })}>
              {activeFilterCount}
            </span>
          ) : null}
          <button type="button" onClick={onClearFilters} className={FILTER_CLEAR_ALL_CLASS}>
            {t("actions.clearAll")}
          </button>
        </>
      ) : null}
      <AnimatePresence initial={false}>
        {hasSourceSwitch ? (
          <FadeItem key="source" className="ml-auto shrink-0 items-center gap-1.5">
            <KbdHint>Z</KbdHint>
            <DatedSourceSwitch source={source} countryCodes={countryCodes} onSourceChange={onSourceChange} />
          </FadeItem>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function CountryPill({ countryCode, isActive, onToggleCountry }: CountryPillProps) {
  const { i18n } = useTranslation();

  return (
    <FacetPill active={isActive} onClick={() => onToggleCountry(countryCode)} className="max-w-full pl-[5px]">
      <CountryCodeTile code={countryCode} size="xs" tone={isActive ? "inverse" : "default"} />
      <span className="truncate">{getCountryName(countryCode, i18n.language)}</span>
    </FacetPill>
  );
}

function CountrySection({ filters, countryPillCodes, isExpanded, onToggleCountry, onToggleExpanded, onFiltersChange }: CountrySectionProps) {
  const { t } = useTranslation("main");
  const { pinnedCountryCodes, foldedCountryCodes } = splitCountryPillCodes(filters, countryPillCodes);
  const foldedCount = foldedCountryCodes.length;
  const isFoldOpen = isExpanded && foldedCount > 0;

  return (
    <FilterPanelSection
      title={t("filters.country")}
      onClear={filters.countryCodes.length > 0 ? () => onFiltersChange((current) => ({ ...current, countryCodes: [] })) : undefined}
    >
      <SmoothHeight contentClassName="flex flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {pinnedCountryCodes.map((countryCode) => (
            <FadeItem key={countryCode}>
              <CountryPill countryCode={countryCode} isActive={filters.countryCodes.includes(countryCode)} onToggleCountry={onToggleCountry} />
            </FadeItem>
          ))}
          {foldedCount > 0 ? (
            <FadeItem key="more">
              <FacetDisclosurePill
                expanded={isFoldOpen}
                label={isFoldOpen ? t("filters.collapseCountries") : t("filters.otherCountries", { count: foldedCount })}
                onClick={onToggleExpanded}
              >
                {isFoldOpen ? t("filters.collapse") : `+${foldedCount}`}
              </FacetDisclosurePill>
            </FadeItem>
          ) : null}
          {isFoldOpen
            ? foldedCountryCodes.map((countryCode) => (
                <FadeItem key={countryCode}>
                  <CountryPill countryCode={countryCode} isActive={false} onToggleCountry={onToggleCountry} />
                </FadeItem>
              ))
            : null}
        </AnimatePresence>
      </SmoothHeight>
    </FilterPanelSection>
  );
}

export function FilterPanel({
  isSheet,
  filters,
  mapCountries,
  onFiltersChange,
  onSourceChange,
  onToggleHeatmap,
  onTogglePlannedMeasurements,
}: FilterPanelProps) {
  const { t, i18n } = useTranslation(["main", "common"]);
  const [isCountryListExpanded, setIsCountryListExpanded] = useState(false);
  const { lookups, isError: hasLookupsError, isRetrying: isRetryingLookups, retry: retryLookups } = useMapLookups();
  const {
    handleToggleOperator,
    handleToggleCountry,
    handleToggleBand,
    handleToggleRat,
    handleToggleStatus,
    handleClearAllRats,
    handleClearAllBands,
    handleRecentDaysChange,
    handleRecentDateFieldChange,
    handleClearFilters,
    activeFilterCount,
  } = useFilterHandlers({ filters, operators: lookups?.operators, onFiltersChange });
  const {
    operators: radiolineOperators,
    isError: hasRadiolineOperatorsError,
    isRetrying: isRetryingRadiolineOperators,
    retry: retryRadiolineOperators,
  } = useRadiolineOperators(filters.showRadiolines);
  const countryPillCodes = listCountryPillCodes(filters, mapCountries, i18n.language);
  const bandFacetCountryCodes = listBandFacetCountryCodes(filters, mapCountries, i18n.language);

  const heading = (
    <PanelHeading
      isSheet={isSheet}
      activeFilterCount={activeFilterCount}
      hasSourceSwitch={mapCountries.isRegisterOnScreen}
      source={filters.source}
      countryCodes={mapCountries.onScreen}
      onClearFilters={handleClearFilters}
      onSourceChange={onSourceChange}
    />
  );

  const sections = (
    <>
      <Reveal shown={hasRegisterSourceNote(filters, mapCountries)} className={SECTION_SLOT_CLASS}>
        <FilterNote>{t("main:filters.registerOnly")}</FilterNote>
      </Reveal>
      <Reveal shown={hasCountryFacet(filters, countryPillCodes)} className={SECTION_SLOT_CLASS}>
        <CountrySection
          filters={filters}
          countryPillCodes={countryPillCodes}
          isExpanded={isCountryListExpanded}
          onToggleCountry={handleToggleCountry}
          onToggleExpanded={() => setIsCountryListExpanded((isExpanded) => !isExpanded)}
          onFiltersChange={onFiltersChange}
        />
      </Reveal>
      <div className={SECTION_SLOT_CLASS}>
        <OperatorRowsSection
          filters={filters}
          mapCountries={mapCountries}
          lookups={lookups}
          hasLookupsError={hasLookupsError}
          isRetryingLookups={isRetryingLookups}
          onRetryLookups={retryLookups}
          onToggleOperator={handleToggleOperator}
          onFiltersChange={onFiltersChange}
        />
      </div>
      <Reveal shown={filters.showRadiolines && (radiolineOperators.length > 0 || hasRadiolineOperatorsError)} className={SECTION_SLOT_CLASS}>
        <RadiolineOperatorsSection
          filters={filters}
          operators={radiolineOperators}
          hasOperatorsError={hasRadiolineOperatorsError}
          isRetryingOperators={isRetryingRadiolineOperators}
          onRetryOperators={retryRadiolineOperators}
          onFiltersChange={onFiltersChange}
        />
      </Reveal>
      <div className={SECTION_SLOT_CLASS}>
        <StandardSection filters={filters} onToggleRat={handleToggleRat} onClearAllRats={handleClearAllRats} />
      </div>
      <div className={SECTION_SLOT_CLASS}>
        <BandSection
          filters={filters}
          facetCountryCodes={bandFacetCountryCodes}
          lookups={lookups}
          onToggleBand={handleToggleBand}
          onClearAllBands={handleClearAllBands}
        />
      </div>
      <Reveal shown={filters.source === "internal"} className={SECTION_SLOT_CLASS}>
        <div className="space-y-3">
          <FilterPanelSection
            title={t("main:filters.stationStatus")}
            onClear={
              isDefaultMapStatus(filters.status)
                ? undefined
                : () => onFiltersChange((current) => ({ ...current, status: DEFAULT_MAP_FILTERS.status }))
            }
          >
            <StationStatusPills statuses={filters.status} onToggleStatus={handleToggleStatus} />
          </FilterPanelSection>
          <UplinkSection filters={filters} onFiltersChange={onFiltersChange} />
        </div>
      </Reveal>
      <div className="pt-0.5">
        <FilterPanelSection
          title={t("main:filters.newOnly")}
          hint={<KbdHint>N</KbdHint>}
          onClear={filters.recentDays === null ? undefined : () => handleRecentDaysChange(null)}
        >
          <RecentDaysFilter filters={filters} onRecentDaysChange={handleRecentDaysChange} onRecentDateFieldChange={handleRecentDateFieldChange} />
        </FilterPanelSection>
      </div>
    </>
  );

  const layerStrip = (
    <FilterLayerStrip
      isSheet={isSheet}
      filters={filters}
      mapCountries={mapCountries}
      onFiltersChange={onFiltersChange}
      onToggleHeatmap={onToggleHeatmap}
      onTogglePlannedMeasurements={onTogglePlannedMeasurements}
    />
  );

  if (isSheet) {
    return (
      <>
        <SheetHeader className="shrink-0 border-b bg-muted/30 px-4 py-3">
          <div className="flex min-h-6 items-center gap-2">{heading}</div>
        </SheetHeader>
        <div className={cn("flex-1", FILTER_SECTIONS_CLASS)}>{sections}</div>
        {layerStrip}
      </>
    );
  }

  return (
    <div className="flex min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-t border-border/60 px-4 py-2">{heading}</div>
      <div className={cn("custom-scrollbar flex-1", FILTER_SECTIONS_CLASS, "pt-2")}>{sections}</div>
      {layerStrip}
    </div>
  );
}
