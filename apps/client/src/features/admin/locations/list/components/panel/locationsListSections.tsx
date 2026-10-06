import { Building03Icon } from "@hugeicons/core-free-icons";
import type { StructureOwner } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  type LocationsListFilters,
  type LocationsListFiltersChange,
  applyMapOperatorChange,
  toggleLocationsListOperator,
  toggleLocationsListWithoutStations,
} from "../../data/locationsListFilters";
import { type LocationsListPanel, listStructureOwnerOptions } from "../../data/locationsListPanel";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { InlineError } from "@/components/ui/error-state";
import { structureOwnersQueryOptions } from "@/features/admin/reference/api/structureOwners";
import { FacetPill, FilterPanelSection } from "@/features/shared/filterPanel";
import { type FacetOptionGroup, ListFacetCombobox } from "@/features/stations/list/components/panel/listFacetCombobox";
import {
  ListCountrySection,
  ListOperatorSection,
  ListRegionSection,
  ListStructureSection,
} from "@/features/stations/list/components/panel/listPanelSections";
import { hasFailedLoad } from "@/lib/queryLoadState";
import { toggleValue } from "@/lib/utils";

export type LocationsListPanelProps = {
  filters: LocationsListFilters;
  onFiltersChange: (change: LocationsListFiltersChange) => void;
};

type LocationsListSectionProps = {
  filters: LocationsListFilters;
  panel: LocationsListPanel;
  isInline?: boolean;
  onFiltersChange: (change: LocationsListFiltersChange) => void;
};

const COMMON_STRUCTURE_TYPE_COUNT = 5;
const OWNER_GROUP_KEY = "owners";

function listOwnerOptions(
  owners: readonly StructureOwner[] | undefined,
  countryCodesInPlay: readonly string[],
  pickedOwnerIds: readonly number[],
  language: string,
): StructureOwner[] {
  const listedOwners = listStructureOwnerOptions(owners, countryCodesInPlay, language);
  if (owners === undefined || pickedOwnerIds.length === 0) return listedOwners;

  const listedOwnerIds = new Set(listedOwners.map((owner) => owner.id));
  const pickedOwnersElsewhere = owners.filter((owner) => pickedOwnerIds.includes(owner.id) && !listedOwnerIds.has(owner.id));
  return [...listedOwners, ...pickedOwnersElsewhere];
}

export function LocationsCountrySection({ panel, isInline, onFiltersChange }: LocationsListSectionProps) {
  return (
    <ListCountrySection
      countries={panel.countries}
      isInline={isInline}
      onPickCountries={(countryCodes) => onFiltersChange((current) => panel.pickCountries(current, countryCodes))}
    />
  );
}

export function LocationsOperatorSection({ panel, onFiltersChange }: LocationsListSectionProps) {
  return (
    <ListOperatorSection
      panel={panel}
      onToggleOperator={(operatorId) => onFiltersChange((current) => toggleLocationsListOperator(current, operatorId))}
      onMapFiltersChange={(update) => onFiltersChange((current) => applyMapOperatorChange(current, update))}
    />
  );
}

export function LocationsRegionSection({ filters, panel, isInline, onFiltersChange }: LocationsListSectionProps) {
  return (
    <ListRegionSection
      regionGroups={panel.regionGroups}
      regionIds={filters.regionIds}
      isInline={isInline}
      onRegionIdsChange={(regionIds) => onFiltersChange((current) => ({ ...current, regionIds }))}
    />
  );
}

export function LocationsStructureSection({ filters, onFiltersChange }: LocationsListSectionProps) {
  return (
    <ListStructureSection
      structureTypes={filters.structureTypes}
      commonTypeCount={COMMON_STRUCTURE_TYPE_COUNT}
      onToggleStructureType={(type) => onFiltersChange((current) => ({ ...current, structureTypes: toggleValue(current.structureTypes, type) }))}
      onClear={() => onFiltersChange((current) => ({ ...current, structureTypes: [] }))}
    />
  );
}

export function LocationsOwnerSection({ filters, panel, isInline, onFiltersChange }: LocationsListSectionProps) {
  const { t, i18n } = useTranslation(["main", "common", "admin"]);
  const ownersQuery = useQuery(structureOwnersQueryOptions());
  const { hasCountryTiles, inPlay } = panel.countries;
  const title = t("common:structure.owner");
  const groups: FacetOptionGroup<number>[] = [
    {
      key: OWNER_GROUP_KEY,
      heading: null,
      options: listOwnerOptions(ownersQuery.data, inPlay, filters.structureOwnerIds, i18n.language).map((owner) => ({
        key: owner.id,
        name: owner.name,
        mark: hasCountryTiles && owner.countryCode !== null ? <CountryCodeTile code={owner.countryCode} size="xs" /> : null,
      })),
    },
  ];

  return (
    <FilterPanelSection
      title={title}
      onClear={filters.structureOwnerIds.length > 0 ? () => onFiltersChange((current) => ({ ...current, structureOwnerIds: [] })) : undefined}
    >
      {hasFailedLoad(ownersQuery) ? (
        <InlineError size="sm" onRetry={() => ownersQuery.refetch()} isRetrying={ownersQuery.isFetching} />
      ) : (
        <ListFacetCombobox
          groups={groups}
          pickedKeys={filters.structureOwnerIds}
          icon={Building03Icon}
          label={title}
          placeholder={t("main:filters.allStructureOwners")}
          emptyText={t("admin:reference.owners.list.noMatches")}
          hasChips
          isInline={isInline}
          onChange={(structureOwnerIds) => onFiltersChange((current) => ({ ...current, structureOwnerIds }))}
        />
      )}
    </FilterPanelSection>
  );
}

export function LocationsStationsSection({ filters, onFiltersChange }: LocationsListSectionProps) {
  const { t } = useTranslation(["main", "common"]);

  return (
    <FilterPanelSection
      title={t("common:labels.stations")}
      onClear={filters.isWithoutStations ? () => onFiltersChange((current) => ({ ...current, isWithoutStations: false })) : undefined}
    >
      <div className="flex flex-wrap gap-1.5">
        <FacetPill active={filters.isWithoutStations} onClick={() => onFiltersChange(toggleLocationsListWithoutStations)}>
          {t("main:filters.withoutStations")}
        </FacetPill>
      </div>
    </FilterPanelSection>
  );
}
