import { AirportTowerIcon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { getOperatorColor } from "@/lib/cellular/operators";
import { cn } from "@/lib/utils";

import type { DraftStation } from "../../utils/fromAnalyzer";
import { AnalyzerCellChangeRow } from "./AnalyzerCellChangeRow";

interface Props {
  station: DraftStation;
  getDuplex: (rowIndex: number) => string | null | undefined;
  onDuplexChange: (rowIndex: number, duplex: string | null) => void;
  onRemoveCell: (rowIndex: number) => void;
  onRemoveStation: () => void;
}

export function AnalyzerStationGroupCard({ station, getDuplex, onDuplexChange, onRemoveCell, onRemoveStation }: Props) {
  const { t } = useTranslation(["submissions", "common"]);
  return (
    <div className={cn("rounded-lg border border-border/50 overflow-hidden", station.hasConflicts && "border-destructive/50")}>
      <div className="flex items-center justify-between bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          {station.operatorMnc !== null ? (
            <div className="size-3 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(station.operatorMnc) }} />
          ) : (
            <HugeiconsIcon icon={AirportTowerIcon} className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span className="text-sm font-semibold">{station.station_id}</span>
          <span className="text-xs text-muted-foreground">{station.cells.length}</span>
          {station.hasConflicts ? (
            <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-destructive">
              {t("batch.conflictBadge")}
            </span>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={onRemoveStation}>
          <HugeiconsIcon icon={Delete02Icon} className="mr-1 h-3 w-3" />
          {t("common:actions.delete")}
        </Button>
      </div>
      <div className="divide-y divide-border/30 px-3 py-1.5 space-y-1">
        {station.cells.map((cell) => (
          <AnalyzerCellChangeRow
            key={cell._rowIndex}
            change={cell}
            selectedDuplex={getDuplex(cell._rowIndex)}
            onDuplexChange={(duplex) => onDuplexChange(cell._rowIndex, duplex)}
            onRemove={() => onRemoveCell(cell._rowIndex)}
          />
        ))}
      </div>
    </div>
  );
}
