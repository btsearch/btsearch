import { Globe02Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import { type FacetOption, FacetToggles } from "../shared/facetToggles";
import { MobileClearFiltersButton, MobileSearchChip } from "../shared/recordListPrimitives";
import { SearchField } from "../shared/searchField";
import { STRUCTURE_OWNER_SEARCH_MAX_LENGTH } from "./structureOwnerListCriteria";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { ClearFiltersButton } from "@/features/shared/filterPanel";

export type StructureOwnerListFilterProps = {
  searchText: string;
  countryOptions: readonly FacetOption<string>[];
  countryFacets: readonly string[];
  activeFilterCount: number;
  onSearchTextChange: (text: string) => void;
  onCountryFacetsChange: (facets: string[]) => void;
  onClearFilters: () => void;
};

export function StructureOwnerListToolbar({
  searchText,
  countryOptions,
  countryFacets,
  activeFilterCount,
  onSearchTextChange,
  onCountryFacetsChange,
  onClearFilters,
}: StructureOwnerListFilterProps) {
  const { t } = useTranslation("admin");

  return (
    <>
      <SearchField
        value={searchText}
        onChange={onSearchTextChange}
        label={t("common:labels.search")}
        placeholder={t("reference.owners.list.searchPlaceholder")}
        maxLength={STRUCTURE_OWNER_SEARCH_MAX_LENGTH}
        className="w-full sm:w-80"
      />
      <FacetToggles
        label={t("users.detail.grants.dialog.country")}
        options={countryOptions}
        selected={countryFacets}
        onChange={onCountryFacetsChange}
      />
      {activeFilterCount > 0 ? <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} className="mb-0.5 cursor-pointer" /> : null}
    </>
  );
}

export function StructureOwnerListMobileFilters({
  searchText,
  countryOptions,
  countryFacets,
  activeFilterCount,
  onSearchTextChange,
  onCountryFacetsChange,
  onClearFilters,
}: StructureOwnerListFilterProps) {
  const { t } = useTranslation("admin");
  const countryLabel = t("users.detail.grants.dialog.country");

  return (
    <>
      <MobileSearchChip
        value={searchText}
        onChange={onSearchTextChange}
        placeholder={t("reference.owners.list.searchPlaceholder")}
        maxLength={STRUCTURE_OWNER_SEARCH_MAX_LENGTH}
      />

      <MobileFilterChip active={countryFacets.length > 0} count={countryFacets.length} icon={Globe02Icon} label={countryLabel}>
        <MobileFilterPanelTitle>{countryLabel}</MobileFilterPanelTitle>
        <FacetToggles
          label={countryLabel}
          options={countryOptions}
          selected={countryFacets}
          onChange={onCountryFacetsChange}
          layout="list"
          showLabel={false}
        />
      </MobileFilterChip>

      {activeFilterCount > 0 ? <MobileClearFiltersButton onClick={onClearFilters} /> : null}
    </>
  );
}
