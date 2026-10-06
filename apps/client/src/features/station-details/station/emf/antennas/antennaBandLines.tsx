import { useTranslation } from "react-i18next";

import { toRatType } from "../../utils/bands";
import type { EmfAntenna } from "../types";
import { listPreviousTilts } from "./antennaComparison";
import { getTiltRangeText, useAntennaFormat } from "./antennaFormat";
import { CHANGE_NOTE_CLASS } from "./antennaLayout";
import { type BandLine, type TiltRange, type TiltScale, getTiltPosition, listBandClusters, listBandLines, listOwnBandEirps } from "./antennaModel";
import { RatGenerationLabel } from "@/features/shared/RatGenerationLabel";
import { cn } from "@/lib/utils";

const LINE_TEXT_CLASS = "font-mono text-[12.5px] leading-[18px] tabular-nums";
const TILT_TRACK_WIDTH = 44;
const TILT_RANGE_MIN_WIDTH = 2;
const TILT_DOT_RADIUS = 3;

type AntennaBandLinesProps = {
  antenna: EmfAntenna;
  previous: EmfAntenna | null;
  tiltScale: TiltScale;
};

type AntennaBandLineProps = {
  line: BandLine;
  totalEirpWatts: number | null;
  previous: EmfAntenna | null;
  tiltScale: TiltScale;
};

type TiltBarProps = {
  measuredTilt: number | null;
  tiltRange: TiltRange;
  tiltScale: TiltScale;
};

export function AntennaBandLines({ antenna, previous, tiltScale }: AntennaBandLinesProps) {
  const lines = listBandLines(antenna);

  if (lines.length === 0) return <span className={cn(LINE_TEXT_CLASS, "py-0.5 text-muted-foreground")}>-</span>;

  return (
    <>
      {lines.map((line) => (
        <AntennaBandLine key={line.key} line={line} totalEirpWatts={antenna.totalEirpWatts} previous={previous} tiltScale={tiltScale} />
      ))}
    </>
  );
}

function AntennaBandLine({ line, totalEirpWatts, previous, tiltScale }: AntennaBandLineProps) {
  const { t } = useTranslation("stationDetails");
  const format = useAntennaFormat();
  const { bands, measuredTilt, tiltRange } = line;
  const previousTilts = previous === null ? [] : listPreviousTilts(bands, previous);
  const ownEirps = listOwnBandEirps(bands, totalEirpWatts);
  const ownEirpText = ownEirps
    .map((band) => (bands.length > 1 ? `${format.frequency(band.frequencyMhz)}: ${format.watts(band.eirpWatts)}` : format.watts(band.eirpWatts)))
    .join(", ");

  return (
    <div className="col-span-3 grid min-h-[22px] grid-cols-subgrid items-start py-0.5">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2.5">
        {listBandClusters(bands).map((cluster) => (
          <span key={cluster.rat ?? "unknown"} className="inline-flex min-w-0 items-baseline gap-[5px]">
            {cluster.rat === null ? null : <RatGenerationLabel rat={toRatType(cluster.rat)} />}
            <span className={LINE_TEXT_CLASS}>{cluster.frequencies.map((frequency) => format.frequency(frequency)).join(" ")}</span>
          </span>
        ))}
      </div>
      <span className={cn(LINE_TEXT_CLASS, "font-semibold")}>
        <span className="sr-only">{t("si2pemAntennaData.fields.measuredTilt")} </span>
        {format.degrees(measuredTilt)}
      </span>
      <div className="flex min-h-[18px] items-center gap-1.5">
        {tiltRange === null ? null : (
          <>
            <TiltBar measuredTilt={measuredTilt} tiltRange={tiltRange} tiltScale={tiltScale} />
            <span className="font-mono text-[11.5px] leading-[18px] whitespace-nowrap text-muted-foreground tabular-nums">
              <span className="sr-only">{t("si2pemAntennaData.fields.tiltRange")} </span>
              {getTiltRangeText(tiltRange, format, t)}
            </span>
          </>
        )}
      </div>
      {previousTilts.length > 0 ? (
        <span className={cn("col-span-3", CHANGE_NOTE_CLASS)}>
          {t("si2pemAntennaData.comparison.was", { value: format.conjunction(previousTilts.map((tilt) => format.degrees(tilt))) })}
        </span>
      ) : null}
      {ownEirps.length > 0 ? (
        <span className="col-span-3 font-mono text-[11px] leading-[14px] text-muted-foreground tabular-nums">EIRP {ownEirpText}</span>
      ) : null}
    </div>
  );
}

function TiltBar({ measuredTilt, tiltRange, tiltScale }: TiltBarProps) {
  if (tiltRange.min === tiltRange.max) return null;

  const rangeStart = getTiltPosition(tiltRange.min, tiltScale) * TILT_TRACK_WIDTH;
  const rangeEnd = getTiltPosition(tiltRange.max, tiltScale) * TILT_TRACK_WIDTH;

  return (
    <span aria-hidden="true" className="relative block h-1 shrink-0 rounded-full bg-foreground/10" style={{ width: TILT_TRACK_WIDTH }}>
      <span
        className="absolute inset-y-0 rounded-full bg-muted-foreground/75"
        style={{ left: rangeStart, width: Math.max(TILT_RANGE_MIN_WIDTH, rangeEnd - rangeStart) }}
      />
      {measuredTilt === null ? null : (
        <span
          className="absolute -top-px size-1.5 rounded-full bg-primary ring-[1.5px] ring-background"
          style={{ left: getTiltPosition(measuredTilt, tiltScale) * TILT_TRACK_WIDTH - TILT_DOT_RADIUS }}
        />
      )}
    </span>
  );
}
