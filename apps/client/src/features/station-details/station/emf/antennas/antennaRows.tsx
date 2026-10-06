import { useId } from "react";
import { useTranslation } from "react-i18next";

import type { EmfAntenna } from "../types";
import { AntennaBandLines } from "./antennaBandLines";
import { getPreviousTotalEirp } from "./antennaComparison";
import { getGroupTitle, useAntennaFormat } from "./antennaFormat";
import { CHANGE_NOTE_CLASS, GROUP_BOX_CLASS, ROW_DIVIDER_CLASS, STACKED_LINES_GRID_CLASS, TABLE_ROW_GRID_CLASS } from "./antennaLayout";
import type { AntennaGroup, TiltScale } from "./antennaModel";
import { AzimuthCompassMark } from "@/components/cellular/azimuthCompass";
import { cn } from "@/lib/utils";

const TABLE_COLUMN_COUNT = 5;
const GROUP_HEADER_CLASS = "flex min-h-8 items-center gap-2 bg-muted/30 py-[5px]";
const MODEL_CLASS = "min-w-0 truncate text-[13.5px] font-semibold leading-5";
const HEIGHT_CLASS = "text-[13.5px] leading-5 whitespace-nowrap tabular-nums";
const EIRP_CLASS = "font-mono text-[12.5px] font-semibold leading-5 whitespace-nowrap tabular-nums";
const NEW_TAG_CLASS = cn(
  "inline-flex h-4 shrink-0 items-center rounded-[5px] bg-emerald-500/15 px-[5px]",
  "text-[10px] font-semibold leading-none text-emerald-800 dark:text-emerald-300",
);

type AntennaGroupBlockProps = {
  group: AntennaGroup;
  isPhone: boolean;
  color: string;
  tiltScale: TiltScale;
  previousAntennas: readonly (EmfAntenna | null)[] | null;
};

type AntennaGroupHeadingProps = {
  group: AntennaGroup;
  color: string;
  titleId: string;
};

type AntennaRowProps = {
  antenna: EmfAntenna;
  previous: EmfAntenna | null;
  isNew: boolean;
  tiltScale: TiltScale;
};

type AntennaModelProps = {
  antenna: EmfAntenna;
  isNew: boolean;
};

type AntennaManufacturerProps = {
  antenna: EmfAntenna;
  className?: string;
};

type PreviousEirpProps = {
  antenna: EmfAntenna;
  previous: EmfAntenna | null;
  className?: string;
};

export function AntennaGroupBlock({ group, isPhone, color, tiltScale, previousAntennas }: AntennaGroupBlockProps) {
  const titleId = useId();
  const Row = isPhone ? AntennaStackedRow : AntennaTableRow;
  const rows = group.entries.map((entry) => {
    const previous = previousAntennas === null ? null : previousAntennas[entry.position];
    const isNew = previousAntennas !== null && previous === null;
    return <Row key={entry.key} antenna={entry.antenna} previous={previous} isNew={isNew} tiltScale={tiltScale} />;
  });

  if (isPhone) {
    return (
      <section aria-labelledby={titleId} className={GROUP_BOX_CLASS}>
        <div className={cn(GROUP_HEADER_CLASS, "px-2.5")}>
          <AntennaGroupHeading group={group} color={color} titleId={titleId} />
        </div>
        <ul>{rows}</ul>
      </section>
    );
  }

  return (
    <div role="rowgroup" className={GROUP_BOX_CLASS}>
      <div role="row" className={cn(GROUP_HEADER_CLASS, "px-3")}>
        <div role="rowheader" aria-colspan={TABLE_COLUMN_COUNT} className="flex min-w-0 flex-1 items-center gap-2">
          <AntennaGroupHeading group={group} color={color} titleId={titleId} />
        </div>
      </div>
      {rows}
    </div>
  );
}

function AntennaGroupHeading({ group, color, titleId }: AntennaGroupHeadingProps) {
  const { t } = useTranslation("stationDetails");
  const format = useAntennaFormat();

  return (
    <>
      <AzimuthCompassMark azimuth={group.kind === "undirected" ? undefined : group.azimuth} color={color} />
      <h3 id={titleId} className="shrink-0 text-sm font-semibold leading-5 tabular-nums">
        {getGroupTitle(group, format, t)}
      </h3>
      <span className="shrink-0 text-xs leading-4 text-muted-foreground">{t("si2pemAntennaData.antennaCount", { count: group.entries.length })}</span>
      {group.frequencies.length > 0 ? (
        <span className="ml-auto min-w-0 truncate font-mono text-[11.5px] leading-4 text-muted-foreground tabular-nums">
          {group.frequencies.map((frequency) => format.frequency(frequency)).join(" ")} MHz
        </span>
      ) : null}
    </>
  );
}

function AntennaTableRow({ antenna, previous, isNew, tiltScale }: AntennaRowProps) {
  const format = useAntennaFormat();

  return (
    <div role="row" className={cn(TABLE_ROW_GRID_CLASS, ROW_DIVIDER_CLASS, "items-start px-3 py-[7px] hover:bg-muted/20")}>
      <div role="cell" className={HEIGHT_CLASS}>
        {format.meters(antenna.heightMeters)}
      </div>
      <div role="cell" className="min-w-0">
        <AntennaModel antenna={antenna} isNew={isNew} />
        <AntennaManufacturer antenna={antenna} />
      </div>
      <div role="cell" aria-colspan={2} className="col-span-3 grid grid-cols-subgrid gap-y-px">
        <AntennaBandLines antenna={antenna} previous={previous} tiltScale={tiltScale} />
      </div>
      <div role="cell" className="text-right">
        <span className={cn("block", EIRP_CLASS)}>{format.watts(antenna.totalEirpWatts)}</span>
        <PreviousEirp antenna={antenna} previous={previous} className="block" />
      </div>
    </div>
  );
}

function AntennaStackedRow({ antenna, previous, isNew, tiltScale }: AntennaRowProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const format = useAntennaFormat();

  return (
    <li className={cn(ROW_DIVIDER_CLASS, "flex flex-col gap-[3px] px-2.5 py-2")}>
      <div className="flex min-w-0 items-baseline gap-2">
        <AntennaModel antenna={antenna} isNew={isNew} />
        <span className={cn("shrink-0", HEIGHT_CLASS)}>
          <span className="sr-only">{t("common:labels.height")} </span>
          {format.meters(antenna.heightMeters)}
        </span>
        <span className={cn("ml-auto shrink-0", EIRP_CLASS)}>
          <span className="sr-only">EIRP </span>
          {format.watts(antenna.totalEirpWatts)}
        </span>
      </div>
      <div className="flex min-w-0 items-baseline gap-2">
        <AntennaManufacturer antenna={antenna} className="min-w-0 flex-1" />
        <PreviousEirp antenna={antenna} previous={previous} className="shrink-0" />
      </div>
      <div className={STACKED_LINES_GRID_CLASS}>
        <AntennaBandLines antenna={antenna} previous={previous} tiltScale={tiltScale} />
      </div>
    </li>
  );
}

function AntennaModel({ antenna, isNew }: AntennaModelProps) {
  const { t } = useTranslation("stationDetails");
  const model = antenna.model ?? t("si2pemAntennaData.unknownModel");

  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span title={model} className={MODEL_CLASS}>
        {model}
      </span>
      {isNew ? <span className={NEW_TAG_CLASS}>{t("si2pemAntennaData.comparison.newTag")}</span> : null}
    </span>
  );
}

function AntennaManufacturer({ antenna, className }: AntennaManufacturerProps) {
  if (!antenna.manufacturer) return null;
  return <span className={cn("block truncate text-[11.5px] leading-4 text-muted-foreground", className)}>{antenna.manufacturer}</span>;
}

function PreviousEirp({ antenna, previous, className }: PreviousEirpProps) {
  const { t } = useTranslation("stationDetails");
  const format = useAntennaFormat();
  const previousEirp = previous === null ? null : getPreviousTotalEirp(antenna, previous);

  if (previousEirp === null) return null;

  return (
    <span className={cn("whitespace-nowrap", CHANGE_NOTE_CLASS, className)}>
      {t("si2pemAntennaData.comparison.was", { value: format.watts(previousEirp) })}
    </span>
  );
}
