import { type CellContext, type SortingState, createColumnHelper } from "@tanstack/react-table";
import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";

import { MONO_TEXT_CLASS } from "../shared/values";
import { OperatorIdentity, OperatorNetworks, OperatorPlmnCode, OperatorStationTotal } from "./operatorListCells";
import type { OperatorListSort } from "./operatorListCriteria";
import type { OperatorListRow } from "./useOperatorListRows";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { DataTableSortButton } from "@/components/ui/data-table-sort-button";
import { EmptyValue } from "@/components/ui/emptyValue";
import type { AppTableFeatures } from "@/lib/tableFeatures";

type OperatorListSortControl = {
  sort: OperatorListSort;
  onSortChange: (sort: OperatorListSort) => void;
};

type OperatorListCellProps = Pick<CellContext<AppTableFeatures, OperatorListRow, unknown>, "row">;

const NAME_COLUMN_ID = "operator";
const STATIONS_COLUMN_ID = "stations";
const columnHelper = createColumnHelper<AppTableFeatures, OperatorListRow>();

export const OperatorListSortContext = createContext<OperatorListSortControl | null>(null);

function useOperatorListSort(): OperatorListSortControl {
  const sortControl = useContext(OperatorListSortContext);
  if (sortControl === null) throw new Error("The operator list headers must render inside OperatorListSortContext");
  return sortControl;
}

function getNextStationSort(sort: OperatorListSort): OperatorListSort {
  if (sort === "-stations") return "stations";
  return sort === "stations" ? "default" : "-stations";
}

function OperatorHeader() {
  const { t } = useTranslation("common");
  const { sort, onSortChange } = useOperatorListSort();
  const isActive = sort === "name";

  return (
    <div className="pl-2">
      <DataTableSortButton
        label={t("common:labels.operator")}
        isActive={isActive}
        isAscending
        onClick={() => onSortChange(isActive ? "default" : "name")}
      />
    </div>
  );
}

function ShortCodeHeader() {
  const { t } = useTranslation("admin");
  return t("admin:reference.operator.fields.shortCode");
}

function PlmnHeader() {
  const { t } = useTranslation("admin");
  return t("admin:reference.operators.columns.plmn");
}

function NetworksHeader() {
  const { t } = useTranslation("admin");
  return t("admin:reference.operators.columns.sharedNetwork");
}

function PositionHeader() {
  const { t } = useTranslation("admin");
  return <div className="text-right">{t("admin:reference.operators.columns.position")}</div>;
}

function StationsHeader() {
  const { t } = useTranslation("admin");
  const { sort, onSortChange } = useOperatorListSort();

  return (
    <div className="flex justify-end">
      <DataTableSortButton
        label={t("admin:reference.operators.columns.activeStations")}
        isActive={sort === "-stations" || sort === "stations"}
        isAscending={sort === "stations"}
        align="end"
        onClick={() => onSortChange(getNextStationSort(sort))}
      />
    </div>
  );
}

function CountryHeader() {
  const { t } = useTranslation("admin");
  return <div className="pr-2 text-right">{t("admin:users.detail.grants.dialog.country")}</div>;
}

function OperatorCell({ row }: OperatorListCellProps) {
  return (
    <div className="pl-2">
      <OperatorIdentity row={row.original} />
    </div>
  );
}

function ShortCodeCell({ row }: OperatorListCellProps) {
  const { shortCode } = row.original.operator;
  if (shortCode === null) return <EmptyValue />;
  return <span className={MONO_TEXT_CLASS}>{shortCode}</span>;
}

function PlmnCell({ row }: OperatorListCellProps) {
  return <OperatorPlmnCode plmn={row.original.operator.primaryPlmn} />;
}

function NetworksCell({ row }: OperatorListCellProps) {
  return <OperatorNetworks networks={row.original.networks} />;
}

function PositionCell({ row }: OperatorListCellProps) {
  const { sortPriority } = row.original.operator;

  return <div className="text-right">{sortPriority === null ? <EmptyValue /> : <span className={MONO_TEXT_CLASS}>{sortPriority}</span>}</div>;
}

function StationsCell({ row }: OperatorListCellProps) {
  return (
    <div className="text-right">
      <OperatorStationTotal stationCount={row.original.stationCount} />
    </div>
  );
}

function CountryCell({ row }: OperatorListCellProps) {
  const { operator, countryName } = row.original;

  return (
    <div className="flex justify-end pr-2">
      <CountryCodeTile code={operator.countryCode} size="sm" label={countryName} />
    </div>
  );
}

export const OPERATOR_LIST_COLUMNS = columnHelper.columns([
  columnHelper.display({ id: NAME_COLUMN_ID, size: 300, header: OperatorHeader, cell: OperatorCell }),
  columnHelper.display({ id: "shortCode", size: 110, header: ShortCodeHeader, cell: ShortCodeCell }),
  columnHelper.display({ id: "plmn", size: 130, header: PlmnHeader, cell: PlmnCell }),
  columnHelper.display({ id: "networks", size: 180, header: NetworksHeader, cell: NetworksCell }),
  columnHelper.display({ id: "position", size: 110, header: PositionHeader, cell: PositionCell }),
  columnHelper.display({ id: STATIONS_COLUMN_ID, size: 150, header: StationsHeader, cell: StationsCell }),
  columnHelper.display({ id: "country", size: 76, header: CountryHeader, cell: CountryCell }),
]);

export const OPERATOR_LIST_SORTING: Record<OperatorListSort, SortingState> = {
  default: [],
  name: [{ id: NAME_COLUMN_ID, desc: false }],
  "-stations": [{ id: STATIONS_COLUMN_ID, desc: true }],
  stations: [{ id: STATIONS_COLUMN_ID, desc: false }],
};
