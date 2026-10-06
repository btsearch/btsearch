import { useTranslation } from "react-i18next";

import { LocationsListCard, LocationsListSkeletonCard } from "./locationsListCard";
import { LOCATIONS_TABLE_CLASSES } from "./locationsListLayout";
import { LocationsListHead, LocationsListRow, LocationsListSkeletonRow } from "./locationsListRow";
import { useLocationRowOpener } from "./locationsListRowActions";
import type { LocationsListTableModel } from "./useLocationsListTable";
import { ListSortBar } from "@/features/stations/list/components/table/listSortButton";
import { ListTableFrame, ListTableSkeleton, isListTableLoading } from "@/features/stations/list/components/table/listTableFrame";
import {
  LIST_FILLED_CARDS_CLASS,
  LIST_FILLED_ROWS_CLASS,
  LIST_FILLED_TABLE_CLASS,
  LIST_HEAD_GROUP_CLASS,
} from "@/features/stations/list/components/table/listTableRow";
import { isListPageFilled } from "@/features/stations/list/components/table/useListTablePaging";
import { useGpsFormat } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

type LocationsListTableProps = {
  table: LocationsListTableModel;
};

export function LocationsListTable({ table }: LocationsListTableProps) {
  const { t } = useTranslation("nav");
  const { page, paging, sort, hasCountryTiles, clearableFilterCount, onSortPick, onFiltersClear } = table;
  const gpsFormat = useGpsFormat();
  const openRow = useLocationRowOpener();
  const isLoading = isListTableLoading(page.status);
  const isFilled = page.status === "ready" && isListPageFilled(paging, page.rows.length);
  const label = t("items.locations");

  if (paging.isMobile) {
    return (
      <ListTableFrame
        paging={paging}
        view={page}
        sortBar={
          <ListSortBar
            idColumn="id"
            idLabel={t("common:labels.id")}
            activeColumn={sort.column}
            isDescending={sort.isDescending}
            onSortPick={onSortPick}
          />
        }
        clearableFilterCount={clearableFilterCount}
        onFiltersClear={onFiltersClear}
      >
        {isLoading ? (
          <ListTableSkeleton count={paging.fittedPageSize}>
            <LocationsListSkeletonCard />
          </ListTableSkeleton>
        ) : null}
        {page.status === "ready" ? (
          <ul aria-label={label} className={isFilled ? LIST_FILLED_CARDS_CLASS : "shrink-0"}>
            {page.rows.map((row) => (
              <LocationsListCard key={row.id} row={row} gpsFormat={gpsFormat} hasCountryTiles={hasCountryTiles} />
            ))}
          </ul>
        ) : null}
      </ListTableFrame>
    );
  }

  return (
    <ListTableFrame paging={paging} view={page} clearableFilterCount={clearableFilterCount} onFiltersClear={onFiltersClear}>
      <div role="table" aria-label={label} className={cn(LOCATIONS_TABLE_CLASSES[gpsFormat], isFilled ? LIST_FILLED_TABLE_CLASS : "shrink-0")}>
        <div role="rowgroup" className={LIST_HEAD_GROUP_CLASS}>
          <LocationsListHead gpsFormat={gpsFormat} sort={sort} onSortPick={onSortPick} />
        </div>
        {isLoading ? (
          <ListTableSkeleton count={paging.fittedPageSize}>
            <LocationsListSkeletonRow gpsFormat={gpsFormat} />
          </ListTableSkeleton>
        ) : null}
        {page.status === "ready" ? (
          <div role="rowgroup" className={isFilled ? LIST_FILLED_ROWS_CLASS : undefined}>
            {page.rows.map((row) => (
              <LocationsListRow key={row.id} row={row} gpsFormat={gpsFormat} hasCountryTiles={hasCountryTiles} onOpen={openRow} />
            ))}
          </div>
        ) : null}
      </div>
    </ListTableFrame>
  );
}
