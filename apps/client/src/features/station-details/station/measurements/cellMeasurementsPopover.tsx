import { SmartPhone01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CellSightings } from "@openbts/shared/contract";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import type { Band, CellRat } from "../types";
import { getBandCode, getBandLabel, toRatType } from "../utils/bands";
import { DetailGrid, MeasurementNote, RecordDetails } from "./cellMeasurementDetails";
import { SECTOR_COLOR_CLASS, formatBandwidth, formatDayRange, getSectorColorStyle } from "./measurementFormat";
import type { StationMeasurements } from "./useStationMeasurements";
import { InlineError } from "@/components/ui/error-state";
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MeasuredCoverageCell } from "@/features/map/crowd/coverage/coverageView";
import { describeObservedCellNumber } from "@/features/map/crowd/coverage/observedCells";
import { cn } from "@/lib/utils";

type CellMeasurementSubject = {
  rat: CellRat;
  band: Band | undefined;
  place: string;
  sectorAzimuth: number | null;
  sightings: CellSightings | null;
  measured: MeasuredCoverageCell | undefined;
};

export type CellMeasurementsStatus = Pick<StationMeasurements, "state" | "isSwitchedOff" | "isCountryPrivate" | "isRetrying" | "retry">;

type CellMeasurementsPopoverProps = {
  subject: CellMeasurementSubject;
  status?: CellMeasurementsStatus;
  showsBandwidth?: boolean;
  className?: string;
};

type ObservedCellMeasurementsPopoverProps = {
  cell: MeasuredCoverageCell;
  band: Band | undefined;
  status?: CellMeasurementsStatus;
  className?: string;
};

type CellMeasurementsContentProps = {
  title: string;
  subject: CellMeasurementSubject;
  status: CellMeasurementsStatus;
};

const TRIGGER_CLASS = cn(
  "inline-flex h-5 shrink-0 cursor-pointer items-center gap-0.5 rounded-md px-1 font-sans text-[10px] leading-5 font-medium text-muted-foreground outline-none",
  "transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 data-popup-open:bg-muted data-popup-open:text-foreground",
);
const LOADED_STATUS: CellMeasurementsStatus = {
  state: "ready",
  isSwitchedOff: false,
  isCountryPrivate: false,
  isRetrying: false,
  retry: () => undefined,
};

export const NOT_IN_DATABASE_CLASS = "text-[11px] leading-4 font-semibold text-amber-800 dark:text-amber-300";

function describeMeasuredBand(band: Band | undefined, rat: CellRat, language: string, t: TFunction): string {
  const label = getBandLabel(band, language);
  if (label === null) return t("stations:cells.unknownBand");
  const code = getBandCode(band);
  return code === null ? `${toRatType(rat)} ${label}` : `${label} ${code}`;
}

export function CellMeasurementsPopover({ subject, status = LOADED_STATUS, showsBandwidth = false, className }: CellMeasurementsPopoverProps) {
  const { t, i18n } = useTranslation("stationDetails");
  const title = `${describeMeasuredBand(subject.band, subject.rat, i18n.language, t)} · ${subject.place}`;
  const bandwidthKhz = subject.sightings?.bandwidthKhz ?? null;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={<PopoverTrigger aria-label={t("measurements.popover.open", { cell: title })} className={cn(TRIGGER_CLASS, className)} />}
        >
          <HugeiconsIcon icon={SmartPhone01Icon} className="size-3" aria-hidden="true" />
          {showsBandwidth && bandwidthKhz !== null ? <span className="tabular-nums">{formatBandwidth(bandwidthKhz, i18n.language)}</span> : null}
        </TooltipTrigger>
        <TooltipContent>{t("measurements.popover.label")}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        collisionPadding={8}
        style={getSectorColorStyle(subject.measured?.colorIndex ?? 0)}
        className={cn(
          "w-80 max-h-[min(30rem,var(--available-height))] overflow-y-auto overscroll-contain max-md:max-h-[min(27.5rem,var(--available-height))]",
          SECTOR_COLOR_CLASS,
        )}
      >
        <CellMeasurementsContent title={title} subject={subject} status={status} />
      </PopoverContent>
    </Popover>
  );
}

export function ObservedCellMeasurementsPopover({ cell, band, status, className }: ObservedCellMeasurementsPopoverProps) {
  const subject: CellMeasurementSubject = {
    rat: cell.record.rat,
    band,
    place: describeObservedCellNumber(cell.record),
    sectorAzimuth: cell.sectorAzimuth,
    sightings: null,
    measured: cell,
  };

  return <CellMeasurementsPopover subject={subject} status={status} className={className} />;
}

function CellMeasurementsContent({ title, subject, status }: CellMeasurementsContentProps) {
  const { t, i18n } = useTranslation(["stationDetails", "main"]);
  const record = subject.measured?.record ?? null;
  const seen = record ?? subject.sightings;
  const bandwidthKhz = subject.sightings?.bandwidthKhz ?? null;

  return (
    <>
      <PopoverHeader className="shrink-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <PopoverTitle className="leading-5">{title}</PopoverTitle>
          {subject.measured?.isOutsideDatabase ? <span className={NOT_IN_DATABASE_CLASS}>{t("measurements.notInDatabase")}</span> : null}
        </div>
        {seen === null ? null : (
          <PopoverDescription className="text-xs leading-4">
            {t("measurements.seen", { days: formatDayRange(seen.firstSeenOn, seen.lastSeenOn, i18n.language) })}
          </PopoverDescription>
        )}
      </PopoverHeader>
      {status.state === "loading" && record === null ? (
        <div className="flex flex-col gap-2">
          <span className="sr-only">{t("measurements.loading")}</span>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-3/4" />
        </div>
      ) : null}
      {status.state === "failed" && record === null ? (
        <InlineError size="sm" title={t("measurements.loadError")} onRetry={status.retry} isRetrying={status.isRetrying} />
      ) : null}
      {status.state === "unavailable" && status.isSwitchedOff ? <MeasurementNote text={t("main:crowd.layers.switchedOff")} /> : null}
      {status.state === "ready" && record === null && status.isCountryPrivate ? <MeasurementNote text={t("main:crowd.coverage.notPublic")} /> : null}
      {record !== null ? (
        <RecordDetails record={record} sectorAzimuth={subject.sectorAzimuth} isOutsideDatabase={subject.measured?.isOutsideDatabase === true} />
      ) : null}
      {record === null && bandwidthKhz !== null ? (
        <DetailGrid items={[{ key: "bandwidth", label: t("measurements.popover.bandwidth"), value: formatBandwidth(bandwidthKhz, i18n.language) }]} />
      ) : null}
    </>
  );
}
