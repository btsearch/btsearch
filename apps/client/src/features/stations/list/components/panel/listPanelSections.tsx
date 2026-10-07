import { Cancel01Icon, Globe02Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { StructureType } from "@openbts/shared/contract";
import { AnimatePresence } from "motion/react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ListCountries, ListPanel, ListRegionGroup } from "../../data/listPanel";
import { COMMON_STRUCTURE_TYPES, LIST_STRUCTURE_TYPES } from "../../data/listStructures";
import { type FacetOptionGroup, ListFacetCombobox } from "./listFacetCombobox";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { FadeItem, Reveal, SmoothHeight } from "@/features/map/components/search-overlay/mapFilterMotion";
import { OperatorRowsSection } from "@/features/map/components/search-overlay/mapFilterOperatorRows";
import type { MapCountries } from "@/features/map/data/mapCountries";
import type { MapFilters, MapFiltersChange } from "@/features/map/data/mapFilters";
import { FacetDisclosurePill, FacetPill, FilterPanelSection } from "@/features/shared/filterPanel";
import { StructureTypeIcon } from "@/features/station-details/station/components/structureTypeIcon";
import { getStructureTypeKey } from "@/features/station-details/station/utils/structure";
import { getCountryName } from "@/lib/geo/countryName";

type ListPanelSlotProps = {
  isShown?: boolean;
  children: ReactNode;
};

type ListCountrySectionProps = {
  countries: ListCountries;
  isInline?: boolean;
  onPickCountries: (countryCodes: string[]) => void;
};

type ListOperatorPanel = Pick<ListPanel<unknown>, "mapFilters" | "countries" | "lookups" | "hasLookupsError" | "isRetryingLookups" | "retryLookups">;

type ListOperatorSectionProps = {
  panel: ListOperatorPanel;
  onToggleOperator: (operatorId: number) => void;
  onMapFiltersChange: (update: MapFiltersChange) => void;
};

type ListRegionSectionProps = {
  regionGroups: readonly ListRegionGroup[];
  regionIds: readonly number[];
  isInline?: boolean;
  onRegionIdsChange: (regionIds: number[]) => void;
};

type ListStructureSectionProps = {
  structureTypes: readonly StructureType[];
  commonTypeCount: number;
  onToggleStructureType: (type: StructureType) => void;
  onClear: () => void;
};

type StructureTypePillProps = {
  type: StructureType;
  isActive: boolean;
  onToggle: (type: StructureType) => void;
};

type ListPanelProps = {
  filters: Record<string, unknown>;
  onFiltersChange: unknown;
  variant?: string;
};

const COUNTRY_GROUP_KEY = "countries";
const NO_COUNTRY_CODES: string[] = [];
const PILLS_CLASS = "flex flex-wrap gap-1.5";
const FILTER_FIELDS_OUTSIDE_PANEL: ReadonlySet<string> = new Set(["searchText", "sort", "page", "pageSize"]);

function hasSameFilterValue(previous: unknown, next: unknown): boolean {
  if (previous === next) return true;
  if (!Array.isArray(previous) || !Array.isArray(next) || previous.length !== next.length) return false;
  return previous.every((value, index) => value === next[index]);
}

function hasSamePanelFilters(previous: Record<string, unknown>, next: Record<string, unknown>): boolean {
  if (previous === next) return true;

  const fields = Object.keys(next);
  if (fields.length !== Object.keys(previous).length) return false;
  return fields.every((field) => FILTER_FIELDS_OUTSIDE_PANEL.has(field) || hasSameFilterValue(previous[field], next[field]));
}

export function hasSameListPanelProps(previous: ListPanelProps, next: ListPanelProps): boolean {
  if (previous.onFiltersChange !== next.onFiltersChange || previous.variant !== next.variant) return false;
  return hasSamePanelFilters(previous.filters, next.filters);
}

export function ListPanelSlot({ isShown = true, children }: ListPanelSlotProps) {
  return (
    <Reveal shown={isShown} className="pt-0.5 pb-2.5">
      {children}
    </Reveal>
  );
}

export function listCountryOptionGroups(countryCodes: readonly string[], language: string): FacetOptionGroup<string>[] {
  return [
    {
      key: COUNTRY_GROUP_KEY,
      heading: null,
      options: countryCodes.map((countryCode) => ({
        key: countryCode,
        name: getCountryName(countryCode, language),
        code: countryCode,
        mark: <CountryCodeTile code={countryCode} size="xs" />,
      })),
    },
  ];
}

export function listRegionOptionGroups(regionGroups: readonly ListRegionGroup[], language: string): FacetOptionGroup<number>[] {
  const hasCountryHeadings = regionGroups.length > 1;

  return regionGroups.map((group) => ({
    key: group.countryCode,
    heading: hasCountryHeadings ? (
      <>
        <CountryCodeTile code={group.countryCode} size="xs" />
        <span className="truncate">{getCountryName(group.countryCode, language)}</span>
      </>
    ) : null,
    options: group.regions.map((region) => ({ key: region.id, name: region.name })),
  }));
}

export function ListCountrySection({ countries, isInline = false, onPickCountries }: ListCountrySectionProps) {
  const { t, i18n } = useTranslation(["main", "admin"]);
  const { language } = i18n;
  const { options, picked } = countries;
  const groups = listCountryOptionGroups(options, language);

  return (
    <FilterPanelSection title={t("main:filters.country")} onClear={picked.length > 0 ? () => onPickCountries([]) : undefined}>
      <ListFacetCombobox
        groups={groups}
        pickedKeys={picked}
        icon={Globe02Icon}
        label={t("main:filters.country")}
        placeholder={t("admin:auditLogs.filters.allCountries")}
        addPlaceholder={t("main:filters.addCountry")}
        emptyText={t("admin:reference.countries.addDialog.noMatches")}
        isInline={isInline}
        getCountText={(shownCount, optionCount) => t("main:filters.countriesShown", { shown: shownCount, count: optionCount })}
        onChange={onPickCountries}
      />
      <Reveal shown={picked.length > 0} className="pt-1.5">
        <SmoothHeight contentClassName={PILLS_CLASS}>
          <AnimatePresence initial={false}>
            {picked.map((countryCode) => (
              <FadeItem key={countryCode}>
                <FacetPill
                  active
                  onClick={() => onPickCountries(picked.filter((pickedCode) => pickedCode !== countryCode))}
                  className="max-w-full pr-2 pl-[5px]"
                >
                  <CountryCodeTile code={countryCode} size="xs" tone="inverse" />
                  <span className="truncate">{getCountryName(countryCode, language)}</span>
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3 shrink-0" aria-hidden="true" />
                </FacetPill>
              </FadeItem>
            ))}
          </AnimatePresence>
        </SmoothHeight>
      </Reveal>
    </FilterPanelSection>
  );
}

function listTickedCountryCodes(panel: ListOperatorPanel): string[] {
  const { lookups } = panel;
  if (lookups === undefined) return NO_COUNTRY_CODES;

  const tickedCountryCodes = new Set<string>();
  for (const operatorId of panel.mapFilters.operatorIds) {
    const countryCode = lookups.operatorsById.get(operatorId)?.operator.countryCode;
    if (countryCode !== undefined) tickedCountryCodes.add(countryCode);
  }
  return panel.countries.options.filter((countryCode) => tickedCountryCodes.has(countryCode));
}

export function ListOperatorSection({ panel, onToggleOperator, onMapFiltersChange }: ListOperatorSectionProps) {
  const { t } = useTranslation(["main", "common"]);
  const { mapFilters, countries } = panel;
  const hasRowPerCountry = countries.hasOperatorRows;
  const tickedCountryCodes = hasRowPerCountry ? NO_COUNTRY_CODES : listTickedCountryCodes(panel);
  const hasRows = hasRowPerCountry || tickedCountryCodes.length > 0;
  const rowFilters: MapFilters = hasRowPerCountry ? mapFilters : { ...mapFilters, countryCodes: tickedCountryCodes };
  const rowCountries: MapCountries = hasRowPerCountry
    ? countries.mapCountries
    : { onScreen: tickedCountryCodes, first: tickedCountryCodes.at(0) ?? null, isRegisterOnScreen: false };
  const title = t("common:labels.operator");
  const countryHint = <p className="text-xs leading-4 text-muted-foreground">{t("main:filters.pickCountryForOperators")}</p>;

  return (
    <div className="space-y-1.5">
      {hasRows ? (
        <OperatorRowsSection
          filters={rowFilters}
          mapCountries={rowCountries}
          lookups={panel.lookups}
          hasLookupsError={panel.hasLookupsError}
          isRetryingLookups={panel.isRetryingLookups}
          onRetryLookups={panel.retryLookups}
          onToggleOperator={onToggleOperator}
          onFiltersChange={onMapFiltersChange}
          title={title}
          hasKeyHint={false}
        />
      ) : (
        <FilterPanelSection title={title}>{countryHint}</FilterPanelSection>
      )}
      {hasRows && !hasRowPerCountry ? countryHint : null}
    </div>
  );
}

export function ListRegionSection({ regionGroups, regionIds, isInline = false, onRegionIdsChange }: ListRegionSectionProps) {
  const { t, i18n } = useTranslation(["main", "stationDetails"]);
  const title = t("stationDetails:specs.region");
  const groups = listRegionOptionGroups(regionGroups, i18n.language);

  return (
    <FilterPanelSection title={title} onClear={regionIds.length > 0 ? () => onRegionIdsChange([]) : undefined}>
      <ListFacetCombobox
        groups={groups}
        pickedKeys={regionIds}
        icon={Location01Icon}
        label={title}
        placeholder={t("main:filters.allRegions")}
        emptyText={t("main:filters.noRegionsFound")}
        hasChips
        isInline={isInline}
        onChange={onRegionIdsChange}
      />
    </FilterPanelSection>
  );
}

function StructureTypePill({ type, isActive, onToggle }: StructureTypePillProps) {
  const { t } = useTranslation();

  return (
    <FacetPill active={isActive} onClick={() => onToggle(type)} className="max-w-full pl-2">
      <StructureTypeIcon type={type} className="size-3.5 shrink-0" />
      <span className="truncate">{t(getStructureTypeKey(type))}</span>
    </FacetPill>
  );
}

export function ListStructureSection({ structureTypes, commonTypeCount, onToggleStructureType, onClear }: ListStructureSectionProps) {
  const { t } = useTranslation(["main", "common"]);
  const [isExpanded, setIsExpanded] = useState(false);
  const commonTypes = COMMON_STRUCTURE_TYPES.slice(0, commonTypeCount);
  const otherTypes = LIST_STRUCTURE_TYPES.filter((type) => !commonTypes.includes(type));
  const pinnedTypes = [...commonTypes, ...otherTypes.filter((type) => structureTypes.includes(type))];
  const foldedTypes = otherTypes.filter((type) => !structureTypes.includes(type));
  const foldedCount = foldedTypes.length;
  const isFoldOpen = isExpanded && foldedCount > 0;

  return (
    <FilterPanelSection title={t("common:structure.type")} onClear={structureTypes.length > 0 ? onClear : undefined}>
      <SmoothHeight contentClassName={PILLS_CLASS}>
        <AnimatePresence initial={false}>
          {pinnedTypes.map((type) => (
            <FadeItem key={type}>
              <StructureTypePill type={type} isActive={structureTypes.includes(type)} onToggle={onToggleStructureType} />
            </FadeItem>
          ))}
          {foldedCount > 0 ? (
            <FadeItem key="more">
              <FacetDisclosurePill
                expanded={isFoldOpen}
                label={isFoldOpen ? t("main:filters.collapseStructureTypes") : t("main:filters.otherStructureTypes", { count: foldedCount })}
                onClick={() => setIsExpanded((wasExpanded) => !wasExpanded)}
              >
                {isFoldOpen ? t("main:filters.collapse") : `+${foldedCount}`}
              </FacetDisclosurePill>
            </FadeItem>
          ) : null}
          {isFoldOpen
            ? foldedTypes.map((type) => (
                <FadeItem key={type}>
                  <StructureTypePill type={type} isActive={false} onToggle={onToggleStructureType} />
                </FadeItem>
              ))
            : null}
        </AnimatePresence>
      </SmoothHeight>
    </FilterPanelSection>
  );
}
