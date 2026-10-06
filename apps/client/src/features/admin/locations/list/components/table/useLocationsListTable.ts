import { LOCATIONS_CARD_HEIGHT } from "./locationsListLayout";
import {
  type LocationsListFilters,
  type LocationsListFiltersChange,
  type LocationsListSortColumn,
  type LocationsListSortState,
  clearLocationsListFiltersAndText,
  countActiveLocationsListFilters,
  getLocationsListSortState,
  pickLocationsListSort,
} from "@/features/admin/locations/list/data/locationsListFilters";
import { type LocationsListPage, useLocationsListPage } from "@/features/admin/locations/list/data/locationsListQueries";
import { type ListTablePaging, useLastListPage, useListTablePaging } from "@/features/stations/list/components/table/useListTablePaging";
import { useListCountries } from "@/features/stations/list/data/listPanel";
import type { ListReadiness } from "@/features/stations/list/data/useListState";

type UseLocationsListTableArgs = {
  filters: LocationsListFilters;
  onFiltersChange: (change: LocationsListFiltersChange) => void;
  readiness: ListReadiness;
};

type UseLocationsListTableResult = {
  page: LocationsListPage;
  table: LocationsListTableModel;
};

export type LocationsListTableModel = {
  page: LocationsListPage;
  paging: ListTablePaging;
  sort: LocationsListSortState;
  hasCountryTiles: boolean;
  clearableFilterCount: number;
  onSortPick: (column: LocationsListSortColumn) => void;
  onFiltersClear: () => void;
};

export function useLocationsListTable({ filters, onFiltersChange, readiness }: UseLocationsListTableArgs): UseLocationsListTableResult {
  const paging = useListTablePaging<LocationsListFilters>(filters, onFiltersChange, LOCATIONS_CARD_HEIGHT);
  const page = useLocationsListPage({ filters, pageSize: paging.pageSize, readiness });
  const { hasCountryTiles } = useListCountries(filters.countryCodes, true);
  useLastListPage<LocationsListFilters>(page.pageBeyondEnd, onFiltersChange);

  function pickSort(column: LocationsListSortColumn) {
    onFiltersChange((current) => pickLocationsListSort(current, column));
  }

  function clearFilters() {
    onFiltersChange(clearLocationsListFiltersAndText);
  }

  const table: LocationsListTableModel = {
    page,
    paging,
    sort: getLocationsListSortState(filters),
    hasCountryTiles,
    clearableFilterCount: countActiveLocationsListFilters(filters) + Number(filters.searchText.trim() !== ""),
    onSortPick: pickSort,
    onFiltersClear: clearFilters,
  };

  return { page, table };
}
