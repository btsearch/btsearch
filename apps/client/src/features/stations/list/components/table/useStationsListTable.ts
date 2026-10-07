import { STATIONS_CARD_HEIGHTS } from "./stationsListLayout";
import { type ListTablePaging, useLastListPage, useListTablePaging } from "./useListTablePaging";
import { useListCountries } from "@/features/stations/list/data/listPanel";
import {
  type StationsListFilters,
  type StationsListFiltersChange,
  type StationsListSortColumn,
  type StationsListSortState,
  type StationsListVariant,
  clearStationsListFiltersAndText,
  countActiveStationsListFilters,
  getStationsListSortState,
  hasStationsListSearchText,
  pickStationsListSort,
} from "@/features/stations/list/data/stationsListFilters";
import { type StationsListPage, useStationsListPage } from "@/features/stations/list/data/stationsListQueries";
import type { ListReadiness } from "@/features/stations/list/data/useListState";

type UseStationsListTableArgs = {
  filters: StationsListFilters;
  onFiltersChange: (change: StationsListFiltersChange) => void;
  variant: StationsListVariant;
  readiness: ListReadiness;
};

type UseStationsListTableResult = {
  page: StationsListPage;
  table: StationsListTableModel;
};

export type StationsListTableModel = {
  variant: StationsListVariant;
  page: StationsListPage;
  paging: ListTablePaging;
  sort: StationsListSortState;
  hasCountryTiles: boolean;
  clearableFilterCount: number;
  onSortPick: (column: StationsListSortColumn) => void;
  onFiltersClear: () => void;
};

export function useStationsListTable({ filters, onFiltersChange, variant, readiness }: UseStationsListTableArgs): UseStationsListTableResult {
  const paging = useListTablePaging<StationsListFilters>(filters, onFiltersChange, STATIONS_CARD_HEIGHTS[variant]);
  const page = useStationsListPage({ filters, variant, pageSize: paging.pageSize, readiness });
  const { hasCountryTiles } = useListCountries(filters.countryCodes, variant === "admin");
  useLastListPage<StationsListFilters>(page.pageBeyondEnd, onFiltersChange);

  function pickSort(column: StationsListSortColumn) {
    onFiltersChange((current) => pickStationsListSort(current, column));
  }

  function clearFilters() {
    onFiltersChange(clearStationsListFiltersAndText);
  }

  const table: StationsListTableModel = {
    variant,
    page,
    paging,
    sort: getStationsListSortState(filters),
    hasCountryTiles,
    clearableFilterCount: countActiveStationsListFilters(filters) + Number(hasStationsListSearchText(filters)),
    onSortPick: pickSort,
    onFiltersClear: clearFilters,
  };

  return { page, table };
}
