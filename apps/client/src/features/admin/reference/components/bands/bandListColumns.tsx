import { Delete02Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { type CellContext, createColumnHelper } from "@tanstack/react-table";
import { createContext, useContext } from "react";
import { useTranslation } from "react-i18next";

import type { Band } from "../../types";
import { RowIconButton } from "../shared/referenceCards";
import { BandCellCount, BandCode, BandDuplex, BandIdentity, BandPlanCountries, BandRange } from "./bandListCells";
import type { BandListRow } from "./useBandListRows";
import type { AppTableFeatures } from "@/lib/tableFeatures";

export type BandListActions = {
  onEdit: (band: Band) => void;
  onDelete: (band: Band) => void;
};

type BandListCellProps = Pick<CellContext<AppTableFeatures, BandListRow, unknown>, "row">;

const columnHelper = createColumnHelper<AppTableFeatures, BandListRow>();

export const BandListActionsContext = createContext<BandListActions | null>(null);

export function useBandListActions(): BandListActions {
  const actions = useContext(BandListActionsContext);
  if (actions === null) throw new Error("The band list rows must render inside BandListActionsContext");
  return actions;
}

function BandHeader() {
  const { t } = useTranslation("common");
  return <div className="pl-2">{t("common:labels.band")}</div>;
}

function CodeHeader() {
  const { t } = useTranslation("admin");
  return t("admin:reference.bands.fields.code");
}

function DuplexHeader() {
  const { t } = useTranslation("admin");
  return t("admin:reference.bands.fields.duplex");
}

function PlansHeader() {
  const { t } = useTranslation("admin");
  return t("admin:reference.bands.columns.plans");
}

function CellsHeader() {
  const { t } = useTranslation("common");
  return <div className="pr-2 text-right">{t("common:labels.cells")}</div>;
}

function BandCell({ row }: BandListCellProps) {
  return (
    <div className="pl-2">
      <BandIdentity band={row.original.band} />
    </div>
  );
}

function CodeCell({ row }: BandListCellProps) {
  return <BandCode code={row.original.band.code} />;
}

function DuplexCell({ row }: BandListCellProps) {
  return <BandDuplex duplex={row.original.band.duplex} />;
}

function DownlinkCell({ row }: BandListCellProps) {
  return <BandRange range={row.original.band.downlinkKhz} />;
}

function UplinkCell({ row }: BandListCellProps) {
  return <BandRange range={row.original.band.uplinkKhz} />;
}

function PlansCell({ row }: BandListCellProps) {
  return <BandPlanCountries detail={row.original.planCountryCodes} />;
}

function CellsCell({ row }: BandListCellProps) {
  return (
    <div className="flex justify-end pr-2">
      <BandCellCount detail={row.original.cellCount} />
    </div>
  );
}

function ActionsCell({ row }: BandListCellProps) {
  const { t } = useTranslation("admin");
  const { onEdit, onDelete } = useBandListActions();
  const { band } = row.original;

  return (
    <div className="flex items-center justify-end gap-0.5">
      <RowIconButton label={t("admin:reference.bands.actions.edit")} icon={PencilEdit02Icon} onClick={() => onEdit(band)} />
      <RowIconButton label={t("admin:reference.bands.actions.delete")} icon={Delete02Icon} destructive onClick={() => onDelete(band)} />
    </div>
  );
}

export const BAND_LIST_COLUMNS = columnHelper.columns([
  columnHelper.display({ id: "band", size: 260, header: BandHeader, cell: BandCell }),
  columnHelper.display({ id: "code", size: 150, header: CodeHeader, cell: CodeCell }),
  columnHelper.display({ id: "duplex", size: 100, header: DuplexHeader, cell: DuplexCell }),
  columnHelper.display({ id: "downlink", size: 160, header: "Downlink (MHz)", cell: DownlinkCell }),
  columnHelper.display({ id: "uplink", size: 160, header: "Uplink (MHz)", cell: UplinkCell }),
  columnHelper.display({ id: "plans", size: 120, header: PlansHeader, cell: PlansCell }),
  columnHelper.display({ id: "cells", size: 130, header: CellsHeader, cell: CellsCell }),
  columnHelper.display({ id: "actions", size: 84, cell: ActionsCell }),
]);
