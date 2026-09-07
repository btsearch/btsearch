import { memo } from "react";
import { useTranslation } from "react-i18next";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import type { NsgSnapshot } from "@/lib/nsg/snapshots";
import type { NsgCell } from "@/lib/nsg/types";

import { getDisplayRat, getReportedCellColumns, isNrNsaCell } from "./cellPresentation";
import { formatDecibelValue, formatValue } from "./display";
import { CellDetails } from "./measurements";

function PrimaryCellSection({ cells, label }: { cells: readonly NsgCell[]; label: string }) {
  return (
    <section className="shrink-0" aria-label={label}>
      {cells.map((cell) => {
        const signal = cell.dbm ?? cell.rsrp;
        return (
          <div key={cell.recordOffset + ":" + cell.cellIndex} className="border-t px-4">
            <div className="flex items-center justify-between gap-3 pt-3">
              <h2 className="text-sm font-semibold">{label}</h2>
              <p className="font-mono text-base font-semibold tabular-nums">
                {formatDecibelValue(signal)}{" "}
                <span className="text-xs font-normal text-muted-foreground">{cell.dbm === null ? "dBm RSRP" : "dBm"}</span>
              </p>
            </div>
            <CellDetails cell={cell} />
          </div>
        );
      })}
    </section>
  );
}

function ReportedCellTable({ cells }: { cells: readonly NsgCell[] }) {
  const rat = cells[0].rat;
  const columns = getReportedCellColumns(rat, cells[0]);

  return (
    <Table>
      <TableHeader className="bg-muted/30">
        <TableRow className="hover:bg-transparent">
          {columns.map((column, index) => (
            <TableHead key={column.key} className={index === 0 ? "h-10 pl-4 pr-1.5 text-xs" : "h-10 px-1.5 text-right text-xs last:pr-4"}>
              <span className="block">{column.label}</span>
              {column.unit ? <span className="block text-[10px] font-normal text-muted-foreground">{column.unit}</span> : null}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {cells.map((cell) => (
          <TableRow key={cell.recordOffset + ":" + cell.cellIndex}>
            {columns.map((column, index) => (
              <TableCell
                key={column.key}
                className={
                  index === 0 ? "py-2 pl-4 pr-1.5 font-mono text-sm tabular-nums" : "px-1.5 py-2 text-right font-mono text-sm tabular-nums last:pr-4"
                }
              >
                {column.key === "dbm" || column.unit === "dBm" || column.unit === "dB"
                  ? formatDecibelValue(column.getValue(cell))
                  : formatValue(column.getValue(cell))}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function NeighborCellSection({ cells }: { cells: readonly NsgCell[] }) {
  const { t } = useTranslation("nsg");

  return (
    <section className="border-t [contain-intrinsic-size:auto_12rem] [content-visibility:auto]">
      <header className="flex items-center gap-2 px-4 py-2.5">
        <RatGenerationLabel rat={getDisplayRat(cells[0].rat)} />
        <h3 className="min-w-0 flex-1 text-sm font-semibold">
          {t("snapshot.neighboringCells", { count: cells.length })} · {cells[0].rat}
        </h3>
      </header>
      <ReportedCellTable cells={cells} />
    </section>
  );
}

function presentationGroupKey(cell: NsgCell): string {
  return `${cell.rat}:${isNrNsaCell(cell) ? "nsa" : "other"}`;
}

type PrimaryCellGroup = { key: string; cells: NsgCell[]; label: string };
type SnapshotCellBlock = (PrimaryCellGroup & { kind: "primary" }) | { key: string; kind: "neighbors"; cells: NsgCell[] };

function addGroupedCell(groups: Map<string, NsgCell[]>, key: string, cell: NsgCell): void {
  const group = groups.get(key);
  if (group) group.push(cell);
  else groups.set(key, [cell]);
}

export const SnapshotDetails = memo(function SnapshotDetails({ snapshot }: { snapshot: NsgSnapshot }) {
  const { t } = useTranslation("nsg");
  const primaryRegistered = snapshot.cells.filter((cell) => cell.registered === true && cell.measurementRole !== "lte-secondary");
  const lteSecondary = snapshot.cells.filter((cell) => cell.measurementRole === "lte-secondary");
  const nrPrimary = snapshot.cells.filter((cell) => cell.measurementRole === "nr-primary");
  const registeredGroups = new Map<string, NsgCell[]>();
  for (const cell of primaryRegistered) addGroupedCell(registeredGroups, presentationGroupKey(cell), cell);
  const otherGroups = new Map<string, NsgCell[]>();
  for (const cell of snapshot.cells) {
    if (cell.registered === true || cell.measurementRole === "nr-primary") continue;
    const key = `${presentationGroupKey(cell)}:${cell.registered === false ? "no" : "unknown"}`;
    addGroupedCell(otherGroups, key, cell);
  }
  const primaryGroups: PrimaryCellGroup[] = [];
  if (nrPrimary.length > 0)
    primaryGroups.push({ key: "nr-primary", cells: nrPrimary, label: t("snapshot.nrPrimaryCells", { count: nrPrimary.length }) });
  if (lteSecondary.length > 0)
    primaryGroups.push({ key: "lte-secondary", cells: lteSecondary, label: t("snapshot.lteSecondaryCells", { count: lteSecondary.length }) });
  for (const [key, cells] of registeredGroups)
    primaryGroups.push({
      key: `registered:${key}`,
      cells,
      label: t(cells.length === 1 ? "snapshot.serving" : "snapshot.registeredCells", { count: cells.length }),
    });
  const blocks: SnapshotCellBlock[] = [];
  const renderedNeighborGroups = new Set<string>();
  for (const group of primaryGroups) {
    blocks.push({ ...group, kind: "primary" });
    for (const [key, cells] of otherGroups) {
      if (presentationGroupKey(cells[0]) !== presentationGroupKey(group.cells[0]) || renderedNeighborGroups.has(key)) continue;
      blocks.push({ key, kind: "neighbors", cells });
      renderedNeighborGroups.add(key);
    }
  }
  for (const [key, cells] of otherGroups) {
    if (renderedNeighborGroups.has(key)) continue;
    blocks.push({ key, kind: "neighbors", cells });
  }

  return (
    <div>
      {primaryGroups.length === 0 ? <p className="shrink-0 border-t px-4 py-3 text-sm text-muted-foreground">{t("snapshot.noServing")}</p> : null}
      {blocks.map((block) =>
        block.kind === "primary" ? (
          <PrimaryCellSection key={block.key} cells={block.cells} label={block.label} />
        ) : (
          <NeighborCellSection key={block.key} cells={block.cells} />
        ),
      )}
    </div>
  );
});
