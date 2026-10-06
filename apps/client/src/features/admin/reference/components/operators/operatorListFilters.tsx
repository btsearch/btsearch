import { Globe02Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import type { CountryOption } from "../../utils/countries";
import { type FacetOption, FacetToggles } from "../shared/facetToggles";
import { MobileClearFiltersButton, MobileSearchChip } from "../shared/recordListPrimitives";
import { SearchField } from "../shared/searchField";
import { OPERATOR_SEARCH_MAX_LENGTH } from "./operatorListCriteria";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { ClearFiltersButton } from "@/features/shared/filterPanel";

export type OperatorListFilterProps = {
  searchText: string;
  countryOptions: readonly CountryOption[];
  countryCodes: readonly string[];
  activeFilterCount: number;
  onSearchTextChange: (text: string) => void;
  onCountryCodesChange: (countryCodes: string[]) => void;
  onClearFilters: () => void;
};

function toCountryFacetOptions(countryOptions: readonly CountryOption[]): FacetOption<string>[] {
  return countryOptions.map((country) => ({
    value: country.code,
    label: country.name,
    lead: <CountryCodeTile code={country.code} size="xs" />,
  }));
}

export function OperatorListToolbar({
  searchText,
  countryOptions,
  countryCodes,
  activeFilterCount,
  onSearchTextChange,
  onCountryCodesChange,
  onClearFilters,
}: OperatorListFilterProps) {
  const { t } = useTranslation("admin");

  return (
    <>
      <SearchField
        className="w-full sm:w-80"
        label={t("common:labels.search")}
        placeholder={t("reference.operators.searchPlaceholder")}
        value={searchText}
        onChange={onSearchTextChange}
        maxLength={OPERATOR_SEARCH_MAX_LENGTH}
      />
      {countryOptions.length > 0 ? (
        <FacetToggles
          label={t("users.detail.grants.dialog.country")}
          options={toCountryFacetOptions(countryOptions)}
          selected={countryCodes}
          onChange={onCountryCodesChange}
        />
      ) : null}
      {activeFilterCount > 0 ? <ClearFiltersButton count={activeFilterCount} onClick={onClearFilters} className="mb-0.5 cursor-pointer" /> : null}
    </>
  );
}

export function OperatorListMobileToolbar({
  searchText,
  countryOptions,
  countryCodes,
  activeFilterCount,
  onSearchTextChange,
  onCountryCodesChange,
  onClearFilters,
}: OperatorListFilterProps) {
  const { t } = useTranslation("admin");
  const countryLabel = t("users.detail.grants.dialog.country");

  return (
    <>
      <MobileSearchChip
        value={searchText}
        onChange={onSearchTextChange}
        placeholder={t("reference.operators.searchPlaceholder")}
        maxLength={OPERATOR_SEARCH_MAX_LENGTH}
      />

      {countryOptions.length > 0 ? (
        <MobileFilterChip active={countryCodes.length > 0} count={countryCodes.length} icon={Globe02Icon} label={countryLabel}>
          <MobileFilterPanelTitle>{countryLabel}</MobileFilterPanelTitle>
          <FacetToggles
            layout="list"
            showLabel={false}
            label={countryLabel}
            options={toCountryFacetOptions(countryOptions)}
            selected={countryCodes}
            onChange={onCountryCodesChange}
          />
        </MobileFilterChip>
      ) : null}

      {activeFilterCount > 0 ? <MobileClearFiltersButton onClick={onClearFilters} /> : null}
    </>
  );
}
