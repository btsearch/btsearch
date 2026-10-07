import { useTranslation } from "react-i18next";

import { ListSortBar } from "./listSortButton";
import { ListTableFrame, ListTableSkeleton, isListTableLoading } from "./listTableFrame";
import { LIST_FILLED_CARDS_CLASS, LIST_FILLED_ROWS_CLASS, LIST_FILLED_TABLE_CLASS, LIST_HEAD_GROUP_CLASS } from "./listTableRow";
import { StationsListCard, StationsListSkeletonCard } from "./stationsListCard";
import { STATIONS_TABLE_CLASSES } from "./stationsListLayout";
import { StationsListHead, StationsListRow, StationsListSkeletonRow } from "./stationsListRow";
import { useStationRowOpeners } from "./stationsListRowActions";
import { isListPageFilled } from "./useListTablePaging";
import type { StationsListTableModel } from "./useStationsListTable";
import { useGpsFormat } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

type StationsListTableProps = {
  table: StationsListTableModel;
};

export function StationsListTable({ table }: StationsListTableProps) {
  const { t } = useTranslation("common");
  const { variant, page, paging, sort, hasCountryTiles, clearableFilterCount, onSortPick, onFiltersClear } = table;
  const openers = useStationRowOpeners(variant);
  const gpsFormat = useGpsFormat();
  const isLoading = isListTableLoading(page.status);
  const isFilled = page.status === "ready" && isListPageFilled(paging, page.rows.length);
  const label = t("labels.stations");

  if (paging.isMobile) {
    return (
      <ListTableFrame
        paging={paging}
        view={page}
        sortBar={
          <ListSortBar
            idColumn="siteId"
            idLabel={t("labels.stationId")}
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
            <StationsListSkeletonCard variant={variant} />
          </ListTableSkeleton>
        ) : null}
        {page.status === "ready" ? (
          <ul aria-label={label} className={isFilled ? LIST_FILLED_CARDS_CLASS : "shrink-0"}>
            {page.rows.map((row) => (
              <StationsListCard key={row.id} row={row} variant={variant} hasCountryTiles={hasCountryTiles} openers={openers} />
            ))}
          </ul>
        ) : null}
      </ListTableFrame>
    );
  }

  return (
    <ListTableFrame paging={paging} view={page} clearableFilterCount={clearableFilterCount} onFiltersClear={onFiltersClear}>
      <div role="table" aria-label={label} className={cn(STATIONS_TABLE_CLASSES[variant], isFilled ? LIST_FILLED_TABLE_CLASS : "shrink-0")}>
        <div role="rowgroup" className={LIST_HEAD_GROUP_CLASS}>
          <StationsListHead variant={variant} sort={sort} onSortPick={onSortPick} />
        </div>
        {isLoading ? (
          <ListTableSkeleton count={paging.fittedPageSize}>
            <StationsListSkeletonRow variant={variant} />
          </ListTableSkeleton>
        ) : null}
        {page.status === "ready" ? (
          <div role="rowgroup" className={isFilled ? LIST_FILLED_ROWS_CLASS : undefined}>
            {page.rows.map((row) => (
              <StationsListRow key={row.id} row={row} variant={variant} hasCountryTiles={hasCountryTiles} gpsFormat={gpsFormat} openers={openers} />
            ))}
          </div>
        ) : null}
      </div>
    </ListTableFrame>
  );
}
