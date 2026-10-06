import type { List } from "@openbts/shared/contract";
import { type CellContext, createColumnHelper } from "@tanstack/react-table";
import { useTranslation } from "react-i18next";

import { AdminListRowMenu } from "./adminListRowMenu";
import { ListLinksChip, ListName, ListOwner, ListStationsChip, ListVisibilityBadge } from "./adminListsCells";
import { CreatedDate } from "@/features/admin/reference/components/shared/values";
import type { AppTableFeatures } from "@/lib/tableFeatures";

type AdminListCellProps = Pick<CellContext<AppTableFeatures, List, unknown>, "row">;

const columnHelper = createColumnHelper<AppTableFeatures, List>();

function NameHeader() {
  const { t } = useTranslation("common");
  return t("common:labels.name");
}

function OwnerHeader() {
  const { t } = useTranslation("admin");
  return t("admin:lists.table.createdBy");
}

function VisibilityHeader() {
  const { t } = useTranslation("admin");
  return t("admin:lists.table.visibility");
}

function StationsHeader() {
  const { t } = useTranslation("common");
  return t("common:labels.stations");
}

function LinksHeader() {
  const { t } = useTranslation("common");
  return t("common:labels.radiolines");
}

function CreatedHeader() {
  const { t } = useTranslation("common");
  return t("common:labels.created");
}

function NameCell({ row }: AdminListCellProps) {
  return <ListName list={row.original} />;
}

function OwnerCell({ row }: AdminListCellProps) {
  return <ListOwner owner={row.original.owner} />;
}

function VisibilityCell({ row }: AdminListCellProps) {
  return <ListVisibilityBadge isPublic={row.original.isPublic} />;
}

function StationsCell({ row }: AdminListCellProps) {
  return <ListStationsChip list={row.original} />;
}

function LinksCell({ row }: AdminListCellProps) {
  return <ListLinksChip list={row.original} />;
}

function CreatedCell({ row }: AdminListCellProps) {
  return <CreatedDate createdAt={row.original.createdAt} />;
}

function MenuCell({ row }: AdminListCellProps) {
  return (
    <div className="flex justify-end">
      <AdminListRowMenu list={row.original} />
    </div>
  );
}

export const ADMIN_LISTS_COLUMNS = columnHelper.columns([
  columnHelper.display({ id: "name", size: 240, header: NameHeader, cell: NameCell }),
  columnHelper.display({ id: "owner", size: 180, header: OwnerHeader, cell: OwnerCell }),
  columnHelper.display({ id: "visibility", size: 110, header: VisibilityHeader, cell: VisibilityCell }),
  columnHelper.display({ id: "stations", size: 130, header: StationsHeader, cell: StationsCell }),
  columnHelper.display({ id: "links", size: 110, header: LinksHeader, cell: LinksCell }),
  columnHelper.display({ id: "createdAt", size: 130, header: CreatedHeader, cell: CreatedCell }),
  columnHelper.display({ id: "menu", size: 56, cell: MenuCell }),
]);
