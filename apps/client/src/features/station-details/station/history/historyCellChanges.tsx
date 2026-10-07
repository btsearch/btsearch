import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { describeCellValues, getCellTitle, listHistoryCellGroups } from "./cellChanges";
import { describeFieldChanges } from "./fieldChanges";
import { HistoryChangeLines } from "./historyChangeLines";
import type { HistoryNames } from "./names";
import type { HistoryCellsPart, StationHistoryAction, StationHistoryCell } from "./types";
import { cn } from "@/lib/utils";

type HistoryCellChangesProps = { part: HistoryCellsPart; names: HistoryNames; topLevel: boolean };
type HistoryCellRowProps = { cell: StationHistoryCell; action: StationHistoryAction; names: HistoryNames };
type HistoryCellValuesProps = { cell: StationHistoryCell; isRemoved: boolean; names: HistoryNames };

const EXPANDED_CELLS_LIMIT = 4;

function HistoryCellValues({ cell, isRemoved, names }: HistoryCellValuesProps) {
  const { t } = useTranslation();
  const values = describeCellValues(cell, names, t);
  if (values.length === 0) return null;

  return (
    <p className="text-xs leading-5 text-muted-foreground wrap-break-word">
      {values.map((cellValue, position) => (
        <span key={cellValue.key}>
          {position > 0 ? <span className="mx-1.5 text-muted-foreground/50">·</span> : null}
          {cellValue.label}:{" "}
          <span className={cn("font-medium", isRemoved ? "text-rose-700 dark:text-rose-300" : "text-foreground")}>{cellValue.value}</span>
        </span>
      ))}
    </p>
  );
}

function HistoryCellRow({ cell, action, names }: HistoryCellRowProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-0.5 px-2.5 py-1.5 sm:grid-cols-[minmax(11rem,14rem)_1fr] sm:gap-3">
      <p className="text-xs font-semibold leading-5 text-foreground">{getCellTitle(cell, action, names, t)}</p>
      {action === "update" ? (
        <HistoryChangeLines lines={describeFieldChanges(cell.fields, names, t)} />
      ) : (
        <HistoryCellValues cell={cell} isRemoved={action === "delete"} names={names} />
      )}
    </div>
  );
}

export function HistoryCellChanges({ part, names, topLevel }: HistoryCellChangesProps) {
  const { t } = useTranslation("common");
  const [cellsExpanded, setCellsExpanded] = useState(part.cells.length <= EXPANDED_CELLS_LIMIT);
  const groups = listHistoryCellGroups(part.cells);

  return (
    <details
      className={cn("group", topLevel ? "mt-0" : "mt-1.5")}
      open={cellsExpanded}
      onToggle={(event) => setCellsExpanded(event.currentTarget.open)}
    >
      <summary className="flex min-h-7 cursor-pointer list-none items-center gap-2 rounded-md px-1 text-xs text-muted-foreground outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-foreground">{t("labels.cells", { count: part.cells.length })}</span>
        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
          {groups.map((group) => (
            <span key={group.rat} className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">
              {group.rat} {group.cells.length}
            </span>
          ))}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          aria-hidden="true"
          className="size-3.5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      {cellsExpanded ? (
        <div className="mt-1.5 overflow-hidden rounded-lg border border-border/70">
          {groups.map((group) => (
            <section key={group.rat} aria-label={group.rat}>
              <div className="flex items-center justify-between bg-muted/50 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                <span>{group.rat}</span>
                <span className="tabular-nums">{t("labels.cells", { count: group.cells.length })}</span>
              </div>
              <div className="divide-y divide-border/60">
                {group.cells.map((cell, position) => (
                  <HistoryCellRow key={`${cell.id}-${position}`} cell={cell} action={part.action} names={names} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </details>
  );
}
