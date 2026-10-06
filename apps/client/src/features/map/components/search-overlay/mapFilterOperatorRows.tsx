import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { MapCountries } from "../../data/mapCountries";
import { type MapFilters, type MapFiltersChange, countAllowedMapOperators } from "../../data/mapFilters";
import type { MapLookups, MapOperator } from "../../data/mapLookups";
import { FadeItem, GrowItem, Reveal, RevealItem, SmoothHeight } from "./mapFilterMotion";
import { type OperatorRow, listOperatorRows } from "./mapFilterPanelRules";
import { BrandMark } from "@/components/cellular/brandMark";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { InlineError } from "@/components/ui/error-state";
import { FacetCount, FacetDisclosurePill, FacetPill, FilterPanelSection, KbdHint } from "@/features/shared/filterPanel";
import { getCountryName } from "@/lib/geo/countryName";
import { cn, toggleValue } from "@/lib/utils";

type OperatorPillProps = {
  entry: MapOperator;
  isTicked: boolean;
  count?: number;
  onToggleOperator: (operatorId: number) => void;
};

type OperatorRowLineProps = {
  row: OperatorRow;
  hasCountryTile: boolean;
  isExpanded: boolean;
  tickedOperatorIds: readonly number[];
  operatorCounts?: ReadonlyMap<number, number>;
  onToggleOperator: (operatorId: number) => void;
  onToggleExpanded: (countryCode: string) => void;
};

type RowPillProps = {
  row: OperatorRow;
  isOpen: boolean;
  onToggleOpen: (countryCode: string) => void;
};

type OperatorRowsSectionProps = {
  filters: MapFilters;
  mapCountries: MapCountries;
  lookups: MapLookups | undefined;
  hasLookupsError: boolean;
  isRetryingLookups: boolean;
  onRetryLookups: () => void;
  onToggleOperator: (operatorId: number) => void;
  onFiltersChange: (update: MapFiltersChange) => void;
  title?: string;
  hasKeyHint?: boolean;
  operatorCounts?: ReadonlyMap<number, number>;
};

const ROW_TILE_CLASS = "mt-1.25 w-6.5 self-start px-0 transition-opacity motion-reduce:transition-none";
export const ROW_PILL_COUNT_CLASS =
  "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground";

function OperatorPill({ entry, isTicked, count, onToggleOperator }: OperatorPillProps) {
  return (
    <FacetPill active={isTicked} onClick={() => onToggleOperator(entry.operator.id)} className="max-w-full gap-[5px] pl-1.5 pr-[9px]">
      <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center">
        <BrandMark brand={entry.brand} size={16} />
      </span>
      <span className="truncate">{entry.operator.name}</span>
      {count === undefined ? null : <FacetCount count={count} isActive={isTicked} />}
    </FacetPill>
  );
}

function OperatorRowLine({
  row,
  hasCountryTile,
  isExpanded,
  tickedOperatorIds,
  operatorCounts,
  onToggleOperator,
  onToggleExpanded,
}: OperatorRowLineProps) {
  const { t, i18n } = useTranslation(["main", "common"]);
  const countryName = getCountryName(row.countryCode, i18n.language);
  const foldedCount = row.foldedOperators.length;
  const isFoldOpen = isExpanded && foldedCount > 0;

  return (
    <div role="group" aria-label={countryName} className="flex items-start">
      <AnimatePresence initial={false}>
        {hasCountryTile ? (
          <GrowItem key="tile">
            <span className="inline-flex pr-1.5">
              <CountryCodeTile
                code={row.countryCode}
                size="xs"
                label={countryName}
                className={cn(ROW_TILE_CLASS, row.isOffScreen ? "opacity-50" : null)}
              />
            </span>
          </GrowItem>
        ) : null}
      </AnimatePresence>
      <SmoothHeight className="min-w-0 flex-1" contentClassName="flex flex-wrap items-center gap-1">
        <AnimatePresence initial={false}>
          {row.pinnedOperators.map((entry) => (
            <FadeItem key={entry.operator.id}>
              <OperatorPill
                entry={entry}
                isTicked={tickedOperatorIds.includes(entry.operator.id)}
                count={operatorCounts?.get(entry.operator.id)}
                onToggleOperator={onToggleOperator}
              />
            </FadeItem>
          ))}
          {foldedCount > 0 ? (
            <FadeItem key="more">
              <FacetDisclosurePill
                expanded={isFoldOpen}
                label={isFoldOpen ? t("main:filters.collapseOperators") : t("common:labels.otherOperators", { count: foldedCount })}
                onClick={() => onToggleExpanded(row.countryCode)}
              >
                {isFoldOpen ? t("main:filters.collapse") : `+${foldedCount}`}
              </FacetDisclosurePill>
            </FadeItem>
          ) : null}
          {isFoldOpen
            ? row.foldedOperators.map((entry) => (
                <FadeItem key={entry.operator.id}>
                  <OperatorPill entry={entry} isTicked={false} count={operatorCounts?.get(entry.operator.id)} onToggleOperator={onToggleOperator} />
                </FadeItem>
              ))
            : null}
          {row.isOffScreen ? (
            <FadeItem key="off-screen" className="ml-0.5 text-[11px] leading-4 text-muted-foreground">
              {t("main:filters.offScreen")}
            </FadeItem>
          ) : null}
        </AnimatePresence>
      </SmoothHeight>
    </div>
  );
}

function RowPill({ row, isOpen, onToggleOpen }: RowPillProps) {
  const { t, i18n } = useTranslation("main");
  const countryName = getCountryName(row.countryCode, i18n.language);
  const tickedCount = row.tickedOperatorCount;
  const label = tickedCount > 0 ? t("filters.countrySelectedOperators", { country: countryName, count: tickedCount }) : countryName;

  return (
    <FacetDisclosurePill
      expanded={isOpen}
      label={label}
      title={label}
      tone="filled"
      onClick={() => onToggleOpen(row.countryCode)}
      className="gap-[5px] pl-[5px] pr-1.5"
    >
      <CountryCodeTile code={row.countryCode} size="xs" />
      {tickedCount > 0 ? <span className={ROW_PILL_COUNT_CLASS}>{tickedCount}</span> : null}
      <HugeiconsIcon
        icon={ArrowDown01Icon}
        className={cn("size-3 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", isOpen ? "rotate-180" : null)}
        aria-hidden="true"
      />
    </FacetDisclosurePill>
  );
}

export function OperatorRowsSection({
  filters,
  mapCountries,
  lookups,
  hasLookupsError,
  isRetryingLookups,
  onRetryLookups,
  onToggleOperator,
  onFiltersChange,
  title,
  hasKeyHint = true,
  operatorCounts,
}: OperatorRowsSectionProps) {
  const { t, i18n } = useTranslation("main");
  const [expandedCountryCodes, setExpandedCountryCodes] = useState<string[]>([]);
  const [openRowCountryCodes, setOpenRowCountryCodes] = useState<string[]>([]);
  const { rows, hasCountryTiles, hasRowPills } = listOperatorRows(filters, mapCountries, lookups, i18n.language);
  const shownRows = hasRowPills ? rows.filter((row) => openRowCountryCodes.includes(row.countryCode)) : rows;
  const hasTickedOperators = countAllowedMapOperators(filters, lookups?.operators) > 0;

  function toggleExpandedCountry(countryCode: string) {
    setExpandedCountryCodes((current) => toggleValue(current, countryCode));
  }

  function toggleOpenRow(countryCode: string) {
    setOpenRowCountryCodes((current) => toggleValue(current, countryCode));
  }

  return (
    <FilterPanelSection
      title={title ?? t("filters.operator")}
      hint={
        hasKeyHint ? (
          <span className="hidden items-center gap-0.5 md:inline-flex">
            <KbdHint>1</KbdHint>
            <span aria-hidden="true" className="font-mono text-[10px] leading-none text-muted-foreground">
              -
            </span>
            <KbdHint>4</KbdHint>
          </span>
        ) : undefined
      }
      onClear={hasTickedOperators ? () => onFiltersChange((current) => ({ ...current, operatorIds: [] })) : undefined}
    >
      {hasLookupsError ? <InlineError size="sm" onRetry={onRetryLookups} isRetrying={isRetryingLookups} /> : null}
      <div className="-my-0.5">
        <Reveal shown={hasRowPills} className="pt-0.5 pb-1">
          <SmoothHeight contentClassName="flex flex-wrap gap-1">
            <AnimatePresence initial={false}>
              {rows.map((row) => (
                <FadeItem key={row.countryCode}>
                  <RowPill row={row} isOpen={openRowCountryCodes.includes(row.countryCode)} onToggleOpen={toggleOpenRow} />
                </FadeItem>
              ))}
            </AnimatePresence>
          </SmoothHeight>
        </Reveal>
        <AnimatePresence initial={false}>
          {shownRows.map((row) => (
            <RevealItem key={row.countryCode} className="py-0.5">
              <OperatorRowLine
                row={row}
                hasCountryTile={hasCountryTiles}
                isExpanded={expandedCountryCodes.includes(row.countryCode)}
                tickedOperatorIds={filters.operatorIds}
                operatorCounts={operatorCounts}
                onToggleOperator={onToggleOperator}
                onToggleExpanded={toggleExpandedCountry}
              />
            </RevealItem>
          ))}
        </AnimatePresence>
      </div>
    </FilterPanelSection>
  );
}
