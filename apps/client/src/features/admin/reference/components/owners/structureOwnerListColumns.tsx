import { Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { type CellContext, type SortingState, createColumnHelper } from "@tanstack/react-table";
import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";

import type { StructureOwner } from "../../types";
import { RowIconButton } from "../shared/referenceCards";
import { OwnerBrand, OwnerCountry, OwnerLocationCountValue, OwnerOperatorName, OwnerTile } from "./structureOwnerListCells";
import type { StructureOwnerListSort } from "./structureOwnerListSearch";
import type { StructureOwnerListRow } from "./useStructureOwnerListRows";
import { DataTableSortButton } from "@/components/ui/data-table-sort-button";
import type { AppTableFeatures } from "@/lib/tableFeatures";

export type StructureOwnerListControls = {
  sort: StructureOwnerListSort;
  onSortChange: (sort: StructureOwnerListSort) => void;
  onEdit: (owner: StructureOwner) => void;
  onDelete: (owner: StructureOwner) => void;
};

type StructureOwnerListCellProps = Pick<CellContext<AppTableFeatures, StructureOwnerListRow, unknown>, "row">;

const LOCATIONS_COLUMN_ID = "locations";
const NEXT_SORT: Record<StructureOwnerListSort, StructureOwnerListSort> = { name: "-locations", "-locations": "locations", locations: "name" };
const columnHelper = createColumnHelper<AppTableFeatures, StructureOwnerListRow>();

export const StructureOwnerListControlsContext = createContext<StructureOwnerListControls | null>(null);

function useStructureOwnerListControls(): StructureOwnerListControls {
  const controls = useContext(StructureOwnerListControlsContext);
  if (controls === null) throw new Error("The structure owner list must render inside StructureOwnerListControlsContext");
  return controls;
}

function OwnerHeader() {
  const { t } = useTranslation("admin");
  return <div className="pl-2">{t("admin:reference.owners.owner")}</div>;
}

function CountryHeader() {
  const { t } = useTranslation("admin");
  return t("admin:users.detail.grants.dialog.country");
}

function BrandHeader() {
  const { t } = useTranslation("admin");
  return t("admin:reference.brands.brand");
}

function OperatorHeader() {
  const { t } = useTranslation("common");
  return t("common:labels.operator");
}

function LocationsHeader() {
  const { t } = useTranslation("nav");
  const { sort, onSortChange } = useStructureOwnerListControls();

  return (
    <div className="flex justify-end">
      <DataTableSortButton
        label={t("nav:items.locations")}
        isActive={sort !== "name"}
        isAscending={sort === "locations"}
        align="end"
        onClick={() => onSortChange(NEXT_SORT[sort])}
      />
    </div>
  );
}

function OwnerCell({ row }: StructureOwnerListCellProps) {
  const { owner, brand } = row.original;

  return (
    <div className="flex min-w-0 items-center gap-3 pl-2">
      <OwnerTile brand={brand} />
      <span className="truncate text-sm font-medium">{owner.name}</span>
    </div>
  );
}

function CountryCell({ row }: StructureOwnerListCellProps) {
  return <OwnerCountry countryCode={row.original.owner.countryCode} />;
}

function BrandCell({ row }: StructureOwnerListCellProps) {
  return <OwnerBrand brand={row.original.brand} />;
}

function OperatorCell({ row }: StructureOwnerListCellProps) {
  return <OwnerOperatorName operator={row.original.operator} />;
}

function LocationsCell({ row }: StructureOwnerListCellProps) {
  return (
    <div className="flex justify-end">
      <OwnerLocationCountValue ownerId={row.original.owner.id} />
    </div>
  );
}

export function OwnerRowActions({ owner }: { owner: StructureOwner }) {
  const { t } = useTranslation("admin");
  const { onEdit, onDelete } = useStructureOwnerListControls();

  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      <RowIconButton label={t("admin:reference.owners.list.edit", { name: owner.name })} icon={PencilEdit02Icon} onClick={() => onEdit(owner)} />
      <RowIconButton
        label={t("admin:reference.owners.list.delete", { name: owner.name })}
        icon={Delete02Icon}
        destructive
        onClick={() => onDelete(owner)}
      />
    </div>
  );
}

function ActionsCell({ row }: StructureOwnerListCellProps) {
  return <OwnerRowActions owner={row.original.owner} />;
}

export const STRUCTURE_OWNER_LIST_COLUMNS = columnHelper.columns([
  columnHelper.display({ id: "owner", size: 300, header: OwnerHeader, cell: OwnerCell }),
  columnHelper.display({ id: "country", size: 170, header: CountryHeader, cell: CountryCell }),
  columnHelper.display({ id: "brand", size: 190, header: BrandHeader, cell: BrandCell }),
  columnHelper.display({ id: "operator", size: 190, header: OperatorHeader, cell: OperatorCell }),
  columnHelper.display({ id: LOCATIONS_COLUMN_ID, size: 140, header: LocationsHeader, cell: LocationsCell }),
  columnHelper.display({ id: "actions", size: 84, cell: ActionsCell }),
]);

export const STRUCTURE_OWNER_LIST_SORTING: Record<StructureOwnerListSort, SortingState> = {
  name: [],
  locations: [{ id: LOCATIONS_COLUMN_ID, desc: false }],
  "-locations": [{ id: LOCATIONS_COLUMN_ID, desc: true }],
};
