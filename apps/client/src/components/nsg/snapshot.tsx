import { memo } from "react";
import { useTranslation } from "react-i18next";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Snapshot } from "@/features/nsg-explorer/cells/snapshots";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import type { NsgCell } from "@/lib/nsg-parser/model";

import { getDisplayRat, getHeadlineSignal, getReportedCellColumns, isNrNsaCell } from "./cellPresentation";
import { formatDecibelValue, formatValue } from "./display";
import { CellDetails } from "./measurements";
import {
  type NsaAggregation,
  type NsaCarrierGroup,
  createNsaAggregation,
  getNsaCarrierRoleLabelKey,
  isNsaAggregationCell,
} from "./snapshotPresentation";

function PrimaryCellSection({ cells, label }: { cells: readonly NsgCell[]; label: string }) {
  return (
    <section className="shrink-0" aria-label={label}>
      {cells.map((cell) => {
        const signal = getHeadlineSignal(cell);
        return (
          <div key={cell.recordOffset + ":" + cell.cellIndex} className="border-t px-4">
            <div className="flex items-center justify-between gap-3 pt-3">
              <h2 className="text-sm font-semibold">{label}</h2>
              <p className="font-mono text-base font-semibold tabular-nums">
                {formatDecibelValue(signal.value)} <span className="text-xs font-normal text-muted-foreground">{signal.suffix}</span>
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

function AggregatedCellDetails({ cell, label }: { cell: NsgCell; label: string }) {
  const signal = getHeadlineSignal(cell);

  return (
    <div className="px-4">
      <div className="flex items-center justify-between gap-3 pt-3">
        <h3 className="text-sm font-semibold">{label}</h3>
        <p className="font-mono text-base font-semibold tabular-nums">
          {formatDecibelValue(signal.value)} <span className="text-xs font-normal text-muted-foreground">{signal.suffix}</span>
        </p>
      </div>
      <CellDetails cell={cell} />
    </div>
  );
}

function NsaCarrierSection({ carrier }: { carrier: NsaCarrierGroup }) {
  const { t } = useTranslation("nsg");
  const label = t(getNsaCarrierRoleLabelKey(carrier.role));

  return (
    <section className="border-t" aria-label={label}>
      {carrier.serving.map((cell) => (
        <AggregatedCellDetails key={`${cell.recordOffset}:${cell.cellIndex}:${cell.rat}:${cell.measurementRole}`} cell={cell} label={label} />
      ))}
      {carrier.serving.length === 0 ? (
        <header className="flex items-center gap-2 bg-muted/20 px-4 py-2.5">
          <RatGenerationLabel rat="NR" />
          <h3 className="min-w-0 flex-1 text-sm font-semibold">{label}</h3>
        </header>
      ) : null}
      {carrier.neighbors.length > 0 ? (
        <div className="border-t">
          <h4 className="px-4 py-2.5 text-sm font-semibold">{t("snapshot.neighboringCells", { count: carrier.neighbors.length })}</h4>
          <ReportedCellTable cells={carrier.neighbors} />
        </div>
      ) : null}
    </section>
  );
}

function NsaAggregationSection({ aggregation }: { aggregation: NsaAggregation }) {
  const { t } = useTranslation("nsg");
  const hasServingCells = aggregation.anchors.length > 0 || aggregation.carriers.some((carrier) => carrier.serving.length > 0);

  return (
    <section className="border-t" aria-label={t("snapshot.nsaGroup")}>
      <header className="flex items-center gap-2 bg-muted/30 px-4 py-2.5">
        <RatGenerationLabel rat="NR" />
        <h2 className="min-w-0 flex-1 text-sm font-semibold">{t("snapshot.nsaGroup")}</h2>
      </header>
      {!hasServingCells ? <p className="border-t px-4 py-3 text-sm text-muted-foreground">{t("snapshot.noServing")}</p> : null}
      {aggregation.carriers.map((carrier) => (
        <NsaCarrierSection key={carrier.key} carrier={carrier} />
      ))}
      {aggregation.anchors.map((cell) => (
        <AggregatedCellDetails
          key={`${cell.recordOffset}:${cell.cellIndex}:${cell.rat}:${cell.measurementRole}`}
          cell={cell}
          label={t("snapshot.ltePrimaryCell")}
        />
      ))}
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

export const SnapshotDetails = memo(function SnapshotDetails({ snapshot }: { snapshot: Snapshot }) {
  const { t } = useTranslation("nsg");
  const nsaAggregation = createNsaAggregation(snapshot.cells);
  const primaryRegistered = snapshot.cells.filter((cell) => cell.registered === true && !isNsaAggregationCell(cell));
  const registeredGroups = new Map<string, NsgCell[]>();
  for (const cell of primaryRegistered) addGroupedCell(registeredGroups, presentationGroupKey(cell), cell);
  const otherGroups = new Map<string, NsgCell[]>();
  for (const cell of snapshot.cells) {
    if (cell.registered === true || isNsaAggregationCell(cell)) continue;
    const key = `${presentationGroupKey(cell)}:${cell.registered === false ? "no" : "unknown"}`;
    addGroupedCell(otherGroups, key, cell);
  }
  const primaryGroups: PrimaryCellGroup[] = [];
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
      {nsaAggregation ? <NsaAggregationSection aggregation={nsaAggregation} /> : null}
      {primaryGroups.length === 0 && nsaAggregation === null ? (
        <p className="shrink-0 border-t px-4 py-3 text-sm text-muted-foreground">{t("snapshot.noServing")}</p>
      ) : null}
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
