import { useTranslation } from "react-i18next";

import { clearLocationsListFilters, countActiveLocationsListFilters } from "../data/locationsListFilters";
import type { LocationsListSearch } from "../data/locationsListSearch";
import { useLocationsListState } from "../data/locationsListState";
import { LocationsListMobileFilters } from "./panel/locationsListMobileFilters";
import { LocationsListPanel } from "./panel/locationsListPanel";
import { LocationsListCount } from "./table/locationsListCount";
import { LOCATIONS_NARROWEST_TABLE_WIDTH, LOCATIONS_TOUCH_NARROWEST_TABLE_WIDTH } from "./table/locationsListLayout";
import { LocationsListTable } from "./table/locationsListTable";
import { useLocationsListTable } from "./table/useLocationsListTable";
import { ListFrame } from "@/features/stations/list/components/frame/listFrame";
import { ListSearchField } from "@/features/stations/list/components/frame/listSearchField";
import { ListSearchRejectedNote } from "@/features/stations/list/components/frame/listSearchRejectedNote";
import { useIsCoarsePointer } from "@/hooks/useCoarsePointer";

type LocationsListPageProps = {
  search: LocationsListSearch;
  onSearchChange: (search: LocationsListSearch) => void;
};

export function LocationsListPage({ search, onSearchChange }: LocationsListPageProps) {
  const { t } = useTranslation(["admin", "nav", "common"]);
  const isCoarsePointer = useIsCoarsePointer();
  const { filters, readiness, changeFilters } = useLocationsListState({ search, onSearchChange });
  const { page, table } = useLocationsListTable({ filters, onFiltersChange: changeFilters, readiness });

  return (
    <ListFrame
      title={t("nav:items.locations")}
      count={<LocationsListCount page={page} />}
      search={
        <ListSearchField
          searchText={filters.searchText}
          onSearchTextChange={(searchText) => changeFilters((current) => ({ ...current, searchText }))}
          placeholder={t("admin:locations.list.searchPlaceholder")}
          label={t("common:labels.search")}
        />
      }
      searchNote={page.isSearchRejected ? <ListSearchRejectedNote /> : null}
      panel={<LocationsListPanel filters={filters} onFiltersChange={changeFilters} />}
      mobileFilters={<LocationsListMobileFilters filters={filters} onFiltersChange={changeFilters} />}
      activeFilterCount={countActiveLocationsListFilters(filters)}
      onClearFilters={() => changeFilters(clearLocationsListFilters)}
      narrowestTableWidth={isCoarsePointer ? LOCATIONS_TOUCH_NARROWEST_TABLE_WIDTH : LOCATIONS_NARROWEST_TABLE_WIDTH}
    >
      <LocationsListTable table={table} />
    </ListFrame>
  );
}
