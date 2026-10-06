import { Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { type CellContext, createColumnHelper } from "@tanstack/react-table";
import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";

import type { Brand } from "../../types";
import { BrandTile } from "../shared/brandTile";
import { RowIconButton } from "../shared/referenceCards";
import { BrandColorValue, BrandLogoInfo, BrandUsageNames } from "./brandListCells";
import type { BrandListRow } from "./useBrandListRows";
import { Button } from "@/components/ui/button";
import type { AppTableFeatures } from "@/lib/tableFeatures";

export type BrandListActions = {
  onEdit: (brand: Brand) => void;
  onDelete: (brand: Brand) => void;
};

type BrandListCellProps = Pick<CellContext<AppTableFeatures, BrandListRow, unknown>, "row">;

const NAME_BUTTON_CLASS = "h-auto min-w-0 shrink cursor-pointer justify-start p-0 font-medium text-foreground";
const columnHelper = createColumnHelper<AppTableFeatures, BrandListRow>();

export const BrandListActionsContext = createContext<BrandListActions | null>(null);

function useBrandListActions(): BrandListActions {
  const actions = useContext(BrandListActionsContext);
  if (actions === null) throw new Error("The brand list rows must render inside BrandListActionsContext");
  return actions;
}

function BrandHeader() {
  const { t } = useTranslation("admin");
  return <div className="pl-2">{t("admin:reference.brands.brand")}</div>;
}

function SlugHeader() {
  const { t } = useTranslation("admin");
  return t("admin:reference.brands.fields.slug");
}

function ColorHeader() {
  const { t } = useTranslation("admin");
  return t("admin:reference.brands.fields.color");
}

function LogoHeader() {
  const { t } = useTranslation("admin");
  return t("admin:reference.brands.fields.logo");
}

function OperatorsHeader() {
  const { t } = useTranslation("nav");
  return t("nav:items.operators");
}

function OwnersHeader() {
  const { t } = useTranslation("nav");
  return t("nav:items.structureOwners");
}

function BrandCell({ row }: BrandListCellProps) {
  const { onEdit } = useBrandListActions();
  const { brand } = row.original;

  return (
    <div className="flex min-w-0 items-center gap-3 pl-2">
      <BrandTile brand={brand} size={32} />
      <Button type="button" variant="link" className={NAME_BUTTON_CLASS} onClick={() => onEdit(brand)}>
        <span className="truncate">{brand.name}</span>
      </Button>
    </div>
  );
}

function SlugCell({ row }: BrandListCellProps) {
  return <span className="block truncate font-mono text-[0.8125rem] leading-5 text-muted-foreground">{row.original.brand.slug}</span>;
}

function ColorCell({ row }: BrandListCellProps) {
  return <BrandColorValue color={row.original.brand.color} />;
}

function LogoCell({ row }: BrandListCellProps) {
  return <BrandLogoInfo logo={row.original.brand.logo} />;
}

function OperatorsCell({ row }: BrandListCellProps) {
  return <BrandUsageNames usage={row.original.operators} />;
}

function OwnersCell({ row }: BrandListCellProps) {
  return <BrandUsageNames usage={row.original.owners} />;
}

export function BrandRowActions({ brand }: { brand: Brand }) {
  const { t } = useTranslation("admin");
  const { onEdit, onDelete } = useBrandListActions();

  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      <RowIconButton label={t("admin:reference.brands.edit")} icon={PencilEdit02Icon} onClick={() => onEdit(brand)} />
      <RowIconButton label={t("admin:reference.brands.delete")} icon={Delete02Icon} destructive onClick={() => onDelete(brand)} />
    </div>
  );
}

function ActionsCell({ row }: BrandListCellProps) {
  return <BrandRowActions brand={row.original.brand} />;
}

export const BRAND_LIST_COLUMNS = columnHelper.columns([
  columnHelper.display({ id: "brand", size: 230, header: BrandHeader, cell: BrandCell }),
  columnHelper.display({ id: "slug", size: 160, header: SlugHeader, cell: SlugCell }),
  columnHelper.display({ id: "color", size: 130, header: ColorHeader, cell: ColorCell }),
  columnHelper.display({ id: "logo", size: 150, header: LogoHeader, cell: LogoCell }),
  columnHelper.display({ id: "operators", size: 180, header: OperatorsHeader, cell: OperatorsCell }),
  columnHelper.display({ id: "owners", size: 220, header: OwnersHeader, cell: OwnersCell }),
  columnHelper.display({ id: "actions", size: 84, cell: ActionsCell }),
]);
