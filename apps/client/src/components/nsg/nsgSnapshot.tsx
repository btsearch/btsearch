import { useTranslation } from "react-i18next";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import type { NsgSnapshot } from "@/lib/nsg/snapshots";
import type { NsgCell } from "@/lib/nsg/types";

import { formatValue } from "./display";
import { getNsgDisplayRat, getNsgReportedCellColumns } from "./nsgCellPresentation";
import { NsgCellDetails } from "./nsgMeasurements";

function ReportedCellTable({ cells }: { cells: NsgCell[] }) {
  const rat = cells[0].rat;
  const columns = getNsgReportedCellColumns(rat);

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
                {formatValue(column.getValue(cell))}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function NsgSnapshotDetails({ snapshot }: { snapshot: NsgSnapshot }) {
  const { t } = useTranslation("nsg");
  const registered = snapshot.cells.filter((cell) => cell.registered === true);
  const otherGroups = new Map<string, NsgCell[]>();
  for (const cell of snapshot.cells) {
    if (cell.registered === true) continue;
    const key = `${cell.rat}:${cell.registered === false ? "no" : "unknown"}`;
    const group = otherGroups.get(key);
    if (group) group.push(cell);
    else otherGroups.set(key, [cell]);
  }

  return (
    <div className="@min-[1000px]:flex @min-[1000px]:h-full @min-[1000px]:min-h-0 @min-[1000px]:flex-col">
      {registered.length > 0 ? (
        <section className="shrink-0" aria-label={t("snapshot.serving")}>
          {registered.map((cell) => (
            <div key={cell.recordOffset + ":" + cell.cellIndex} className="border-t px-4">
              <div className="flex items-center justify-between gap-3 pt-3">
                <h2 className="text-sm font-semibold">
                  {t(registered.length === 1 ? "snapshot.serving" : "snapshot.registeredCells", { count: registered.length })}
                </h2>
                <p className="font-mono text-base font-semibold tabular-nums">
                  {formatValue(cell.dbm)} <span className="text-xs font-normal text-muted-foreground">dBm</span>
                </p>
              </div>
              <NsgCellDetails cell={cell} />
            </div>
          ))}
        </section>
      ) : (
        <p className="shrink-0 border-t px-4 py-3 text-sm text-muted-foreground">{t("snapshot.noServing")}</p>
      )}
      <div className="custom-scrollbar @min-[1000px]:min-h-0 @min-[1000px]:flex-1 @min-[1000px]:overflow-y-auto @min-[1000px]:overscroll-contain">
        {[...otherGroups].map(([key, cells]) => (
          <section key={key} className="border-t">
            <header className="flex items-center gap-2 px-4 py-2.5">
              <RatGenerationLabel rat={getNsgDisplayRat(cells[0].rat)} />
              <h3 className="min-w-0 flex-1 text-sm font-semibold">
                {t("snapshot.neighboringCells", { count: cells.length })} · {cells[0].rat}
              </h3>
            </header>
            <ReportedCellTable cells={cells} />
          </section>
        ))}
      </div>
    </div>
  );
}
