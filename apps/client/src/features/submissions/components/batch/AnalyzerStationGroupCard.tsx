import { AirportTowerIcon, ArrowDown01Icon, Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DraftStation } from "../../utils/fromAnalyzer";
import { AnalyzerCellChangeRow } from "./AnalyzerCellChangeRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { StationTitle } from "@/features/station-details/components/stationTitle";
import { cn } from "@/lib/utils";

interface Props {
  station: DraftStation;
  duplexSelections: ReadonlyMap<number, string | null>;
  onDuplexChange: (stationInternalId: number, rowIndex: number, duplex: string | null) => void;
  onRemoveCell: (stationInternalId: number, rowIndex: number) => void;
  onRemoveStation: (stationInternalId: number) => void;
}

export const AnalyzerStationGroupCard = memo(function AnalyzerStationGroupCard({
  station,
  duplexSelections,
  onDuplexChange,
  onRemoveCell,
  onRemoveStation,
}: Props) {
  const { t } = useTranslation(["submissions", "common"]);
  const headingId = `analyzer-station-${station.stationInternalId}`;
  const [open, setOpen] = useState(true);

  return (
    <section
      aria-labelledby={headingId}
      className={cn("@container overflow-hidden rounded-xl border bg-card", station.hasConflicts && "border-destructive/50")}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <header className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5 @sm:px-4">
          <CollapsibleTrigger className="group flex min-w-0 cursor-pointer select-none items-center gap-3 text-left">
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              className="size-3.5 shrink-0 -rotate-90 text-muted-foreground transition-transform group-data-panel-open:rotate-0 motion-reduce:transition-none"
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-col @lg:flex-row @lg:items-center @lg:gap-3">
              <span id={headingId} className="flex min-w-0 items-center gap-2">
                {station.operatorName === null ? (
                  <HugeiconsIcon icon={AirportTowerIcon} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : null}
                <StationTitle
                  stationId={station.station_id}
                  operator={station.operatorName !== null ? { name: station.operatorName, mnc: station.operatorMnc } : undefined}
                />
              </span>
              <p className="shrink-0 text-xs text-muted-foreground @lg:border-l @lg:pl-3">{t("batch.cellCount", { count: station.cells.length })}</p>
            </div>
            {station.hasConflicts ? <Badge variant="destructive">{t("batch.conflictBadge")}</Badge> : null}
          </CollapsibleTrigger>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="default"
              className="h-11 cursor-pointer text-muted-foreground hover:text-destructive sm:h-8"
              aria-label={t("batch.removeStation", { stationId: station.station_id })}
              onClick={() => onRemoveStation(station.stationInternalId)}
            >
              <HugeiconsIcon icon={Delete02Icon} className="size-4" aria-hidden="true" />
              <span className="max-sm:sr-only">{t("common:actions.delete")}</span>
            </Button>
          </div>
        </header>
        <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out [&[hidden]:not([hidden='until-found'])]:hidden data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
          <ul className="divide-y divide-border/60">
            {station.cells.map((cell) => (
              <AnalyzerCellChangeRow
                key={cell._rowIndex}
                change={cell}
                selectedDuplex={duplexSelections.get(cell._rowIndex)}
                onDuplexChange={(duplex) => onDuplexChange(station.stationInternalId, cell._rowIndex, duplex)}
                onRemove={() => onRemoveCell(station.stationInternalId, cell._rowIndex)}
              />
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
});
