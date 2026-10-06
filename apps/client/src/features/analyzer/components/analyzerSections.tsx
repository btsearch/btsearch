import { AlertCircleIcon, Cancel01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { UNKNOWN_BAND_KEY } from "../model/bands";
import { ANALYZER_RATS, ANALYZER_SORTS, type AnalyzerFilters, type BandFacet, ROW_STATUSES, listKindPills } from "../model/filters";
import type { DifferenceFilter } from "../model/types";
import { ANALYZER_SECOND_LINE_CLASS } from "./analyzerLayout";
import { useAnalyzerTexts } from "./analyzerTexts";
import type { AnalyzerPanelProps } from "./analyzerTypes";
import { FadeItem, SmoothHeight } from "@/features/map/components/search-overlay/mapFilterMotion";
import { OperatorRowsSection } from "@/features/map/components/search-overlay/mapFilterOperatorRows";
import type { MapCountries } from "@/features/map/data/mapCountries";
import { DEFAULT_MAP_FILTERS, type MapFilters, type MapFiltersChange } from "@/features/map/data/mapFilters";
import { FacetCount, FacetCountryMark, FacetDisclosurePill, FacetPill, FilterPanelSection, ToneFacetPill } from "@/features/shared/filterPanel";
import { RAT_CELL_SPECS } from "@/features/shared/rat";
import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import { toRatType } from "@/features/station-details/station/utils/bands";
import { STATION_STATUS_TINTS } from "@/features/stations/components/stationStatusFilter";
import { getCountryName } from "@/lib/geo/countryName";
import { toggleValue } from "@/lib/utils";

type ResultStatus = (typeof ROW_STATUSES)[number];

type KindPillProps = {
  kind: DifferenceFilter;
  count: number;
  isActive: boolean;
  onToggle: (kind: DifferenceFilter) => void;
};

type BandPillProps = {
  facet: BandFacet;
  isActive: boolean;
  onToggle: (key: string) => void;
};

const NO_COUNT = 0;
const PILLS_CLASS = "flex flex-wrap gap-1.5";
const RESULT_PILLS: Record<ResultStatus, { icon: IconSvgElement; activeClassName: string; iconClassName: string }> = {
  found: { icon: CheckmarkCircle02Icon, activeClassName: STATION_STATUS_TINTS.published, iconClassName: "text-emerald-600 dark:text-emerald-400" },
  probable: { icon: AlertCircleIcon, activeClassName: STATION_STATUS_TINTS.pending, iconClassName: "text-yellow-600 dark:text-yellow-400" },
  notFound: { icon: Cancel01Icon, activeClassName: STATION_STATUS_TINTS.inactive, iconClassName: "text-red-600 dark:text-red-400" },
};

function toOperatorMapFilters(operatorIds: number[]): MapFilters {
  return { ...DEFAULT_MAP_FILTERS, operatorIds };
}

function applyOperatorChange(current: AnalyzerFilters, update: MapFiltersChange): AnalyzerFilters {
  const mapFilters = toOperatorMapFilters(current.operatorIds);
  const nextMapFilters = typeof update === "function" ? update(mapFilters) : update;
  return { ...current, operatorIds: nextMapFilters.operatorIds };
}

function AfterAnalysisNote() {
  const { t } = useTranslation("cellAnalyzer");

  return <p className={ANALYZER_SECOND_LINE_CLASS}>{t("panel.afterAnalysis")}</p>;
}

export function ResultSection({ filters, panel, onFiltersChange }: AnalyzerPanelProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { getStatusLabel } = useAnalyzerTexts();
  const { counts, hasResults } = panel;
  const canClear = hasResults && filters.statuses.length > 0;

  return (
    <FilterPanelSection title={t("panel.result")} onClear={canClear ? () => onFiltersChange((current) => ({ ...current, statuses: [] })) : undefined}>
      {hasResults ? (
        <div className={PILLS_CLASS}>
          {ROW_STATUSES.map((status) => (
            <ToneFacetPill
              key={status}
              isActive={filters.statuses.includes(status)}
              icon={RESULT_PILLS[status].icon}
              activeClassName={RESULT_PILLS[status].activeClassName}
              iconClassName={RESULT_PILLS[status].iconClassName}
              onClick={() => onFiltersChange((current) => ({ ...current, statuses: toggleValue(current.statuses, status) }))}
            >
              <span>{getStatusLabel(status)}</span>
              <FacetCount count={counts.statuses[status]} isActive={false} />
            </ToneFacetPill>
          ))}
        </div>
      ) : (
        <AfterAnalysisNote />
      )}
    </FilterPanelSection>
  );
}

function KindPill({ kind, count, isActive, onToggle }: KindPillProps) {
  const { getKindLabel } = useAnalyzerTexts();

  return (
    <FacetPill active={isActive} onClick={() => onToggle(kind)} className="max-w-full">
      <span className="truncate">{getKindLabel(kind)}</span>
      <FacetCount count={count} isActive={isActive} />
    </FacetPill>
  );
}

export function KindSection({ filters, panel, onFiltersChange }: AnalyzerPanelProps) {
  const { t } = useTranslation("cellAnalyzer");
  const [isExpanded, setIsExpanded] = useState(false);
  const { counts, hasResults } = panel;
  const { pinned, folded } = listKindPills(counts, filters.kinds);
  const foldedCount = folded.length;
  const isFoldOpen = isExpanded && foldedCount > 0;
  const canClear = hasResults && filters.kinds.length > 0;

  function toggleKind(kind: DifferenceFilter) {
    onFiltersChange((current) => ({ ...current, kinds: toggleValue(current.kinds, kind) }));
  }

  return (
    <FilterPanelSection title={t("diff.title")} onClear={canClear ? () => onFiltersChange((current) => ({ ...current, kinds: [] })) : undefined}>
      {hasResults ? (
        <SmoothHeight contentClassName={PILLS_CLASS}>
          <AnimatePresence initial={false}>
            {pinned.map((kind) => (
              <FadeItem key={kind}>
                <KindPill kind={kind} count={counts.kinds.get(kind) ?? NO_COUNT} isActive={filters.kinds.includes(kind)} onToggle={toggleKind} />
              </FadeItem>
            ))}
            {foldedCount > 0 ? (
              <FadeItem key="more">
                <FacetDisclosurePill
                  expanded={isFoldOpen}
                  label={isFoldOpen ? t("panel.collapseKinds") : t("panel.otherKinds", { count: foldedCount })}
                  onClick={() => setIsExpanded((wasExpanded) => !wasExpanded)}
                >
                  {isFoldOpen ? t("main:filters.collapse") : `+${foldedCount}`}
                </FacetDisclosurePill>
              </FadeItem>
            ) : null}
            {isFoldOpen
              ? folded.map((kind) => (
                  <FadeItem key={kind}>
                    <KindPill kind={kind} count={counts.kinds.get(kind) ?? NO_COUNT} isActive={false} onToggle={toggleKind} />
                  </FadeItem>
                ))
              : null}
          </AnimatePresence>
        </SmoothHeight>
      ) : (
        <AfterAnalysisNote />
      )}
    </FilterPanelSection>
  );
}

export function RatSection({ filters, panel, onFiltersChange }: AnalyzerPanelProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { counts } = panel;

  return (
    <FilterPanelSection
      title={t("nsg:filters.technology")}
      onClear={filters.rats.length > 0 ? () => onFiltersChange((current) => ({ ...current, rats: [] })) : undefined}
    >
      <div className={PILLS_CLASS}>
        {ANALYZER_RATS.map((rat) => {
          const isActive = filters.rats.includes(rat);
          const spec = RAT_CELL_SPECS[toRatType(rat)];

          return (
            <FacetPill
              key={rat}
              active={isActive}
              onClick={() => onFiltersChange((current) => ({ ...current, rats: toggleValue(current.rats, rat) }))}
              className="pl-1.5"
            >
              <GenerationTag active={isActive}>{spec.gen}</GenerationTag>
              <span>{spec.label}</span>
              <FacetCount count={counts.rats[rat]} isActive={isActive} />
            </FacetPill>
          );
        })}
      </div>
    </FilterPanelSection>
  );
}

export function OperatorSection({ filters, panel, onFiltersChange }: AnalyzerPanelProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { fileCountryCodes } = panel;
  const mapCountries: MapCountries = { onScreen: fileCountryCodes, first: fileCountryCodes.at(0) ?? null, isRegisterOnScreen: false };

  return (
    <OperatorRowsSection
      filters={toOperatorMapFilters(filters.operatorIds)}
      mapCountries={mapCountries}
      lookups={panel.operatorLookups}
      operatorCounts={panel.counts.operators}
      hasLookupsError={panel.hasLookupsError}
      isRetryingLookups={panel.isRetryingLookups}
      onRetryLookups={panel.retryLookups}
      onToggleOperator={(operatorId) => onFiltersChange((current) => ({ ...current, operatorIds: toggleValue(current.operatorIds, operatorId) }))}
      onFiltersChange={(update) => onFiltersChange((current) => applyOperatorChange(current, update))}
      title={t("common:labels.operator")}
      hasKeyHint={false}
    />
  );
}

function BandPill({ facet, isActive, onToggle }: BandPillProps) {
  const { t, i18n } = useTranslation("cellAnalyzer");
  const { key, label: bandLabel, count, markCountryCode } = facet;
  const label = bandLabel ?? t("stations:cells.unknownBand");

  if (key === UNKNOWN_BAND_KEY) {
    return (
      <FacetPill active={isActive} label={t("main:filters.unknownBand")} onClick={() => onToggle(key)} className="font-mono tabular-nums">
        <span>{t("stations:cells.unknownBand")}</span>
        <FacetCount count={count} isActive={isActive} />
      </FacetPill>
    );
  }
  if (markCountryCode === null) {
    return (
      <FacetPill active={isActive} onClick={() => onToggle(key)} className="font-mono tabular-nums">
        <span>{label}</span>
        <FacetCount count={count} isActive={isActive} />
      </FacetPill>
    );
  }

  return (
    <FacetPill
      active={isActive}
      label={t("panel.bandOnlyIn", { band: label, country: getCountryName(markCountryCode, i18n.language) })}
      onClick={() => onToggle(key)}
      className="gap-[5px] pr-1.5 font-mono tabular-nums"
    >
      <span>{label}</span>
      <FacetCount count={count} isActive={isActive} />
      <FacetCountryMark countryCode={markCountryCode} isActive={isActive} />
    </FacetPill>
  );
}

export function BandSection({ filters, panel, onFiltersChange }: AnalyzerPanelProps) {
  const { t } = useTranslation("cellAnalyzer");

  function toggleBand(key: string) {
    onFiltersChange((current) => ({ ...current, bandKeys: toggleValue(current.bandKeys, key) }));
  }

  return (
    <FilterPanelSection
      title={t("common:labels.band")}
      onClear={filters.bandKeys.length > 0 ? () => onFiltersChange((current) => ({ ...current, bandKeys: [] })) : undefined}
    >
      <SmoothHeight contentClassName={PILLS_CLASS}>
        <AnimatePresence initial={false}>
          {panel.bandFacets.map((facet) => (
            <FadeItem key={facet.key}>
              <BandPill facet={facet} isActive={filters.bandKeys.includes(facet.key)} onToggle={toggleBand} />
            </FadeItem>
          ))}
        </AnimatePresence>
      </SmoothHeight>
    </FilterPanelSection>
  );
}

export function ConfirmationSection({ filters, panel, onFiltersChange }: AnalyzerPanelProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { counts, hasResults } = panel;
  const isActive = filters.isUnconfirmedOnly;
  const canClear = hasResults && isActive;

  return (
    <FilterPanelSection
      title={t("panel.confirmation")}
      onClear={canClear ? () => onFiltersChange((current) => ({ ...current, isUnconfirmedOnly: false })) : undefined}
    >
      {hasResults ? (
        <div className={PILLS_CLASS}>
          <FacetPill active={isActive} onClick={() => onFiltersChange((current) => ({ ...current, isUnconfirmedOnly: !current.isUnconfirmedOnly }))}>
            <span>{t("main:filters.unconfirmed")}</span>
            <FacetCount count={counts.unconfirmed} isActive={isActive} />
          </FacetPill>
        </div>
      ) : (
        <AfterAnalysisNote />
      )}
    </FilterPanelSection>
  );
}

export function SortSection({ filters, panel, onFiltersChange }: AnalyzerPanelProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { getSortLabel } = useAnalyzerTexts();

  return (
    <FilterPanelSection title={t("common:sorting.title")}>
      {panel.hasResults ? (
        <div className={PILLS_CLASS}>
          {ANALYZER_SORTS.map((sort) => (
            <FacetPill key={sort} active={filters.sort === sort} onClick={() => onFiltersChange((current) => ({ ...current, sort }))}>
              {getSortLabel(sort)}
            </FacetPill>
          ))}
        </div>
      ) : (
        <AfterAnalysisNote />
      )}
    </FilterPanelSection>
  );
}
