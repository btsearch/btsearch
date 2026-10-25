import { ArrowDown01Icon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { StationMeasurements } from "../../measurements/useStationMeasurements";
import { type CellColumn, type CellNetworks, type CellTable, getColumnKey } from "../../utils/cells";
import { type SectorIndex, findCellSector } from "../../utils/sectors";
import { CellTableRow } from "./cellTableRow";
import { SharedNetworksChip, SharedValueChip } from "./sharedValueChip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { listNetworkMarks } from "@/features/shared/operatorMarks";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { useHorizontalScroll } from "@/hooks/useHorizontalScroll";
import { cn } from "@/lib/utils";

const HEADER_CELL_CLASS = "px-4 py-2 text-left font-medium text-muted-foreground";
const BAND_HEADER_CELL_CLASS = cn("w-px whitespace-nowrap", HEADER_CELL_CLASS);

type CellTableCardProps = {
  table: CellTable;
  sectorsById: SectorIndex;
  networks: CellNetworks;
  measurements: StationMeasurements;
};

type ColumnHeaderProps = {
  column: CellColumn;
};

export function CellTableCard({ table, sectorsById, networks, measurements }: CellTableCardProps) {
  const { t } = useTranslation(["common", "stations", "stationDetails"]);
  const [open, setOpen] = useState(true);
  const scrollRef = useHorizontalScroll<HTMLDivElement>();
  const seenCellCount = table.cells.filter((cell) => cell.sightings !== null && cell.sightings !== undefined).length;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-xl overflow-hidden">
      <div className={cn("relative flex items-start gap-2 bg-muted/50 px-4 py-2", open && "border-b")}>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1.5">
          <CollapsibleTrigger className="flex min-h-6 cursor-pointer items-center gap-2 after:absolute after:inset-0">
            <RatGenerationLabel rat={table.rat} />
            <span className="font-semibold text-sm">{table.rat}</span>
            <span className="text-xs text-muted-foreground">({t("labels.cells", { count: table.cells.length })})</span>
          </CollapsibleTrigger>
          {table.sharedValues.length > 0 || table.sharedExtraPlmns.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {table.sharedValues.map((shared) => (
                <SharedValueChip key={shared.field} label={shared.label} value={shared.value} />
              ))}
              {table.sharedExtraPlmns.length > 0 ? (
                <SharedNetworksChip
                  label={t("stations:edit.cells.networks.alsoFor")}
                  rat={table.rat}
                  marks={listNetworkMarks(table.sharedExtraPlmns, networks.operators, networks.brands)}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none flex h-6 shrink-0 items-center transition-transform motion-reduce:transition-none",
            open && "rotate-180",
          )}
        >
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 text-muted-foreground" />
        </span>
      </div>

      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out [&[hidden]:not([hidden='until-found'])]:hidden data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
        <div ref={scrollRef} className="overflow-x-auto">
          <table aria-label={table.rat} className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                {table.columns.map((column) => (
                  <ColumnHeader key={getColumnKey(column)} column={column} />
                ))}
              </tr>
            </thead>
            <tbody>
              {table.cells.map((cell) => (
                <CellTableRow
                  key={cell.id}
                  cell={cell}
                  columns={table.columns}
                  sector={findCellSector(cell, sectorsById)}
                  networks={networks}
                  measurements={measurements}
                />
              ))}
            </tbody>
          </table>
        </div>
        {seenCellCount > 0 && seenCellCount < table.cells.length ? (
          <p className="flex items-center gap-1.5 border-t px-4 py-2 text-xs text-muted-foreground">
            <HugeiconsIcon icon={SmartPhone01Icon} className="size-3 shrink-0" aria-hidden="true" />
            <span>{t("stationDetails:measurements.unseenCellsNote")}</span>
          </p>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}

function ColumnHeader({ column }: ColumnHeaderProps) {
  const { t } = useTranslation("common");

  if (column.kind === "band")
    return (
      <th scope="col" className={BAND_HEADER_CELL_CLASS}>
        {t("labels.band")}
      </th>
    );
  if (column.kind === "networks")
    return (
      <th scope="col" className={HEADER_CELL_CLASS}>
        {t("stations:edit.cells.columns.networks")}
      </th>
    );
  if (column.kind === "sector")
    return (
      <th scope="col" className={HEADER_CELL_CLASS}>
        {t("labels.azimuth")}
      </th>
    );
  if (column.kind === "notes")
    return (
      <th scope="col" className={HEADER_CELL_CLASS}>
        {t("labels.notes")}
      </th>
    );

  return (
    <th scope="col" className={HEADER_CELL_CLASS}>
      {column.tooltip === undefined ? (
        column.label
      ) : (
        <Tooltip>
          <TooltipTrigger>
            <span className="cursor-help">{column.label}</span>
          </TooltipTrigger>
          <TooltipContent>{column.tooltip}</TooltipContent>
        </Tooltip>
      )}
    </th>
  );
}
