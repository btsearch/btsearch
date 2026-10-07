import type { CSSProperties } from "react";

import { type CellColumn, NO_SITE_SWITCHES, listCellColumns, toGridTemplate } from "@/features/station-editing/components/cells/cellGrid";
import type { CellNumberField, Rat } from "@/features/station-editing/model/types";

type BatchColumns = {
  columns: readonly CellColumn[];
  gridStyle: CSSProperties;
};

const SHOWN_COLUMN_KINDS: ReadonlySet<CellColumn["kind"]> = new Set(["band", "sector", "number", "cellType", "confirmed"]);
const CONTROL_FIELDS: Record<Rat, readonly CellNumberField[]> = {
  gsm: ["lac"],
  umts: ["lac", "rnc", "uarfcn"],
  lte: ["tac", "enbid", "clid", "pci", "earfcn"],
  nr: [],
};
const FIELD_CONTROL_WIDTH = 22;
const TAIL_MIN_WIDTH = 124;
const columnsByKey = new Map<string, BatchColumns>();

export function getBatchColumns(rat: Rat, hasConfirmedColumn: boolean): BatchColumns {
  const key = `${rat}:${hasConfirmedColumn}`;
  const known = columnsByKey.get(key);
  if (known !== undefined) return known;

  const columns = listCellColumns({
    rat,
    hasConfirmedColumn,
    hasStandaloneCells: rat === "nr",
    isAreaCodePerCell: true,
    switches: NO_SITE_SWITCHES,
  })
    .filter((column) => SHOWN_COLUMN_KINDS.has(column.kind))
    .map((column) => {
      if (column.kind !== "number" || !CONTROL_FIELDS[rat].includes(column.spec.field)) return column;
      return { ...column, width: column.width + FIELD_CONTROL_WIDTH };
    });
  const batchColumns: BatchColumns = { columns, gridStyle: { "--cell-columns": toGridTemplate(columns, TAIL_MIN_WIDTH) } as CSSProperties };

  columnsByKey.set(key, batchColumns);
  return batchColumns;
}
