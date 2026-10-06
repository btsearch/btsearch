import { useTranslation } from "react-i18next";

import type { Cell } from "../../types";
import { getCellChannel } from "../../utils/bands";
import { type CellColumn, type CellFreshness, getCellFreshness, getCellIdentifier, getColumnKey } from "../../utils/cells";
import { getCellDownlinkFrequency } from "../../utils/frequencies";
import { type SectorInfo, formatSectorAzimuth } from "../../utils/sectors";
import { BandCell } from "./bandCell";
import { NotesCell } from "./notesCell";
import { EmptyValue } from "@/components/ui/emptyValue";
import { cn } from "@/lib/utils";

const MONO_CELL_CLASS = "px-4 py-2 font-mono";
const CELL_CONTENT_CLASS = "flex items-center gap-1.5 whitespace-nowrap";

type CellTableRowProps = {
  cell: Cell;
  columns: readonly CellColumn[];
  sector: SectorInfo | null;
};

type RowCellProps = {
  column: CellColumn;
  cell: Cell;
  sector: SectorInfo | null;
  freshness: CellFreshness | null;
};

type SectorCellProps = {
  sector: SectorInfo | null;
};

type ChannelCellProps = {
  cell: Cell;
};

export function CellTableRow({ cell, columns, sector }: CellTableRowProps) {
  const freshness = getCellFreshness(cell);

  return (
    <tr
      className={cn(
        "border-b last:border-b-0 hover:bg-muted/20",
        freshness === "new" && "border-l-2 border-l-green-500",
        freshness === "updated" && "border-l-2 border-l-amber-500",
      )}
    >
      {columns.map((column) => (
        <RowCell key={getColumnKey(column)} column={column} cell={cell} sector={sector} freshness={freshness} />
      ))}
    </tr>
  );
}

function RowCell({ column, cell, sector, freshness }: RowCellProps) {
  if (column.kind === "band") return <BandCell cell={cell} />;
  if (column.kind === "sector") return <SectorCell sector={sector} />;
  if (column.kind === "channel") return <ChannelCell cell={cell} />;
  if (column.kind === "notes") return <NotesCell cell={cell} freshness={freshness} />;
  return <td className={MONO_CELL_CLASS}>{getCellIdentifier(cell, column.field) ?? <EmptyValue />}</td>;
}

function SectorCell({ sector }: SectorCellProps) {
  const { t } = useTranslation("stationDetails");

  return (
    <td className={MONO_CELL_CLASS}>
      {sector === null ? (
        <EmptyValue />
      ) : (
        <div className={CELL_CONTENT_CLASS}>
          <span className="text-[11px] font-semibold leading-5 text-foreground/80 tabular-nums">{sector.label}</span>
          <span className={sector.azimuth === null ? "font-sans" : undefined}>{formatSectorAzimuth(sector.azimuth, t)}</span>
        </div>
      )}
    </td>
  );
}

function ChannelCell({ cell }: ChannelCellProps) {
  const channel = getCellChannel(cell);
  const frequency = getCellDownlinkFrequency(cell);

  return (
    <td className={MONO_CELL_CLASS}>
      {channel === null ? (
        <EmptyValue />
      ) : (
        <div className={CELL_CONTENT_CLASS}>
          <span>{channel}</span>
          {frequency !== null ? <span className="font-sans text-xs tabular-nums text-muted-foreground">{frequency}</span> : null}
        </div>
      )}
    </td>
  );
}
