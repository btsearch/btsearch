import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { getBandCode, getBandLabel, toRatType } from "../utils/bands";
import { formatSectorAzimuth } from "../utils/sectors";
import { type CellMeasurementsStatus, NOT_IN_DATABASE_CLASS, ObservedCellMeasurementsPopover } from "./cellMeasurementsPopover";
import { SECTOR_COLOR_CLASS, formatDayMonth, getSectorColorStyle } from "./measurementFormat";
import type { StationMeasurements } from "./useStationMeasurements";
import { AzimuthCompassMark } from "@/components/cellular/azimuthCompass";
import { InlineError } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import type { MeasuredCoverageSector } from "@/features/map/crowd/coverage/coverageStore";
import type { MeasuredCoverageBand, MeasuredCoverageCell } from "@/features/map/crowd/coverage/coverageView";
import { describeObservedCellNumber } from "@/features/map/crowd/coverage/observedCells";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { cn } from "@/lib/utils";

export type CoverageCellRowMode =
  | { kind: "switch"; onChoose: (observedCellId: number | null) => void }
  | { kind: "page"; getHash: (observedCellId: number) => string; onOpen?: () => void };

type CoverageCellListProps = {
  measurements: StationMeasurements;
  band: MeasuredCoverageBand | null;
  chosenCellId: number | null;
  sectorsByCellId: ReadonlyMap<number, MeasuredCoverageSector>;
  mode: CoverageCellRowMode;
  onChooseBand: (band: MeasuredCoverageBand) => void;
  action?: ReactNode;
};

type CoverageCellRowProps = {
  cell: MeasuredCoverageCell;
  band: MeasuredCoverageBand;
  sector: MeasuredCoverageSector | null;
  isChosen: boolean;
  hasTrailingSlot: boolean;
  mode: CoverageCellRowMode;
  status: CellMeasurementsStatus;
};

const ROW_CLASS =
  "flex h-full min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-4 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset";
const META_CLASS = "shrink-0 whitespace-nowrap text-xs leading-4 text-muted-foreground";

function readCellIdentity(cell: MeasuredCoverageCell): { label: string; value: number | null } {
  const { record } = cell;
  if (record.rat === "gsm") return { label: "CID", value: record.cid };
  if (record.rat === "umts") return { label: "PSC", value: record.psc };
  return { label: "PCI", value: record.pci };
}

export function CoverageCellList({ measurements, band, chosenCellId, sectorsByCellId, mode, onChooseBand, action }: CoverageCellListProps) {
  const { t, i18n } = useTranslation(["stationDetails", "main", "stations"]);

  if (measurements.state === "loading") {
    return (
      <div className="flex flex-col gap-3 px-4 pb-4">
        <span className="sr-only">{t("measurements.loading")}</span>
        <div className="flex gap-1.5">
          <Skeleton className="h-6 w-18" />
          <Skeleton className="h-6 w-22" />
          <Skeleton className="h-6 w-22" />
        </div>
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-3/4" />
      </div>
    );
  }
  if (measurements.state === "failed") {
    return (
      <div className="px-4 pb-4">
        <InlineError title={t("measurements.loadError")} onRetry={measurements.retry} isRetrying={measurements.isRetrying} />
      </div>
    );
  }
  if (band === null) {
    return (
      <p className="px-4 pb-3 text-xs text-muted-foreground">
        {t(measurements.isCountryPrivate ? "main:crowd.coverage.notPublic" : "main:crowd.coverage.noCells")}
      </p>
    );
  }

  const hasTrailingSlot = band.cells.some((cell) => cell.isOutsideDatabase);

  return (
    <>
      <div role="group" aria-label={t("main:crowd.coverage.band")} className="flex flex-wrap gap-1.5 px-4 pb-3">
        {measurements.bands.map((entry) => {
          const isChosen = entry.bandId === band.bandId;
          const code = getBandCode(entry.band);
          const rat = entry.cells[0]?.record.rat;
          return (
            <button
              key={String(entry.bandId)}
              type="button"
              aria-pressed={isChosen}
              onClick={() => onChooseBand(entry)}
              className={cn(
                "inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs leading-4 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                isChosen ? "bg-primary/10 text-primary" : "bg-muted text-foreground hover:bg-border",
              )}
            >
              {rat === undefined ? null : <RatGenerationLabel rat={toRatType(rat)} />}
              <span className="font-mono">{getBandLabel(entry.band, i18n.language) ?? t("stations:cells.unknownBand")}</span>
              {code === null ? null : <span className="font-mono text-[11px] text-muted-foreground">{code}</span>}
            </button>
          );
        })}
      </div>
      {action}
      <ul className="border-t">
        {band.cells.map((cell) => {
          const sector = cell.record.matchedCellId === null ? null : (sectorsByCellId.get(cell.record.matchedCellId) ?? null);
          return (
            <CoverageCellRow
              key={cell.record.id}
              cell={cell}
              band={band}
              sector={sector}
              isChosen={cell.record.id === chosenCellId}
              hasTrailingSlot={hasTrailingSlot}
              mode={mode}
              status={measurements}
            />
          );
        })}
      </ul>
    </>
  );
}

function CoverageCellRow({ cell, band, sector, isChosen, hasTrailingSlot, mode, status }: CoverageCellRowProps) {
  const { t, i18n } = useTranslation(["stationDetails", "main"]);
  const { record } = cell;
  const identity = readCellIdentity(cell);
  const place = sector === null ? describeObservedCellNumber(record) : formatSectorAzimuth(sector.azimuth, t);
  const rowLabel = t("main:crowd.coverage.showCell", { cell: cell.label });
  const content = (
    <>
      <AzimuthCompassMark azimuth={cell.bearingDegrees ?? undefined} color="var(--sector-color)" />
      <span className="flex min-w-0 flex-1 items-center gap-1.5 whitespace-nowrap">
        {sector === null ? null : <span className="text-[11px] leading-5 font-semibold text-foreground/80">{sector.label}</span>}
        <span className={cn("truncate", (sector === null || sector.azimuth !== null) && "font-mono")}>{place}</span>
        {cell.isOutsideDatabase ? <span className={NOT_IN_DATABASE_CLASS}>{t("measurements.notInDatabase")}</span> : null}
      </span>
      <span className={cn(META_CLASS, "w-21")}>
        {identity.label} <span className={cn("font-mono", identity.value !== null && "text-foreground")}>{identity.value ?? "-"}</span>
      </span>
      <span className={cn(META_CLASS, "w-14 text-right")}>{t("measurements.people", { count: record.personCount })}</span>
      <span className={cn(META_CLASS, "hidden w-25 text-right @md:block")}>
        {t("measurements.lastSeen", { date: formatDayMonth(record.lastSeenOn, i18n.language) })}
      </span>
    </>
  );

  return (
    <li
      style={getSectorColorStyle(cell.colorIndex)}
      className={cn("flex h-9 items-center border-b border-border/60 last:border-b-0", SECTOR_COLOR_CLASS, isChosen && "bg-muted")}
    >
      {mode.kind === "switch" ? (
        <button
          type="button"
          aria-pressed={isChosen}
          aria-label={rowLabel}
          onClick={() => mode.onChoose(isChosen ? null : record.id)}
          className={cn(ROW_CLASS, !isChosen && "hover:bg-muted/50")}
        >
          {content}
        </button>
      ) : (
        <Link to="/" hash={mode.getHash(record.id)} aria-label={rowLabel} onClick={mode.onOpen} className={cn(ROW_CLASS, "hover:bg-muted/50")}>
          {content}
        </Link>
      )}
      {cell.isOutsideDatabase ? (
        <ObservedCellMeasurementsPopover cell={cell} band={band.band} status={status} className="mr-3 w-5 justify-center px-0" />
      ) : null}
      {hasTrailingSlot && !cell.isOutsideDatabase ? <span aria-hidden="true" className="mr-3 size-5 shrink-0" /> : null}
    </li>
  );
}
