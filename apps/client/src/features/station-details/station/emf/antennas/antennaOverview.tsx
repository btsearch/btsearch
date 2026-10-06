import { type Ref, useId } from "react";
import { useTranslation } from "react-i18next";

import { getGroupDirectionName, getGroupTitle, useAntennaFormat } from "./antennaFormat";
import { OVERVIEW_CLASS, OVERVIEW_DETAIL_CLASS, OVERVIEW_PHONE_CLASS } from "./antennaLayout";
import type { AntennaGroup, HeightLevel } from "./antennaModel";
import { AzimuthCompass } from "@/components/cellular/azimuthCompass";

const LADDER_MIN_HEIGHT = 64;
const LADDER_STEP = 22;
const LADDER_GROUND_SPACE = 8;
const LADDER_SVG_WIDTH = 40;
const LADDER_AXIS_X = 10;
const LADDER_AXIS_TOP = 4;
const LADDER_GROUND_HALF_WIDTH = 6;
const LADDER_HIGHEST_LEVEL_Y = 8;
const LADDER_FIRST_LABEL_Y = 12;
const LADDER_LABEL_HALF_HEIGHT = 9;
const LADDER_LABEL_LEFT = 38;
const LADDER_LINK_START_X = 13;
const LADDER_LINK_END_X = 32;
const LADDER_DOT_RADIUS = 3.5;

type AntennaOverviewProps = {
  groups: readonly AntennaGroup[];
  heights: readonly HeightLevel[];
  color: string;
  selectedGroup: AntennaGroup | null;
  onSelectedGroupKeyChange: (groupKey: string | null) => void;
  selectedDirectionLabelRef: Ref<HTMLButtonElement>;
  isPhone: boolean;
};

type AntennaHeightLadderProps = {
  heights: readonly HeightLevel[];
};

function getLevelY(heightMeters: number, highestMeters: number, groundY: number): number {
  if (highestMeters <= 0) return groundY;
  const share = Math.min(1, Math.max(0, heightMeters / highestMeters));
  return LADDER_HIGHEST_LEVEL_Y + (1 - share) * (groundY - LADDER_HIGHEST_LEVEL_Y);
}

function getLabelY(position: number): number {
  return LADDER_FIRST_LABEL_Y + position * LADDER_STEP;
}

export function AntennaOverview({
  groups,
  heights,
  color,
  selectedGroup,
  onSelectedGroupKeyChange,
  selectedDirectionLabelRef,
  isPhone,
}: AntennaOverviewProps) {
  const { t } = useTranslation("stationDetails");
  const format = useAntennaFormat();
  const directedGroups = groups.filter((group) => group.kind !== "undirected");
  const directions = directedGroups.map((group) => ({
    azimuth: group.azimuth,
    text: getGroupTitle(group, format, t),
    name: `${getGroupDirectionName(group, format, t)}, ${t("si2pemAntennaData.antennaCount", { count: group.entries.length })}`,
  }));

  function selectAzimuth(azimuth: number | null | undefined) {
    const group = azimuth === undefined ? undefined : directedGroups.find((candidate) => candidate.azimuth === azimuth);
    onSelectedGroupKeyChange(group?.key ?? null);
  }

  const compass = (
    <AzimuthCompass
      directions={directions}
      color={color}
      selectedAzimuth={selectedGroup?.azimuth}
      onSelectedAzimuthChange={selectAzimuth}
      selectedLabelRef={selectedDirectionLabelRef}
    />
  );

  if (isPhone) {
    return (
      <div className={OVERVIEW_PHONE_CLASS}>
        {compass}
        <p className="self-stretch text-xs leading-4 text-muted-foreground">
          {t("si2pemAntennaData.antennaHeights")}:{" "}
          <span className="font-mono font-semibold text-foreground tabular-nums">
            {heights.map((level) => `${format.meters(level.heightMeters)} (${level.antennaCount})`).join(", ")}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className={OVERVIEW_CLASS}>
      {compass}
      <AntennaHeightLadder heights={heights} />
    </div>
  );
}

function AntennaHeightLadder({ heights }: AntennaHeightLadderProps) {
  const { t } = useTranslation("stationDetails");
  const format = useAntennaFormat();
  const titleId = useId();
  const ladderHeight = Math.max(LADDER_MIN_HEIGHT, heights.length * LADDER_STEP + LADDER_GROUND_SPACE);
  const groundY = ladderHeight - LADDER_GROUND_SPACE;
  const highestMeters = heights.length > 0 ? heights[0].heightMeters : 0;

  return (
    <section aria-labelledby={titleId} className={OVERVIEW_DETAIL_CLASS}>
      <h3 id={titleId} className="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {t("si2pemAntennaData.antennaHeights")}
      </h3>
      <div className="relative" style={{ height: ladderHeight }}>
        <svg width={LADDER_SVG_WIDTH} height={ladderHeight} aria-hidden="true" className="absolute top-0 left-0 block overflow-visible">
          <line x1={LADDER_AXIS_X} y1={LADDER_AXIS_TOP} x2={LADDER_AXIS_X} y2={groundY} strokeWidth="1.5" className="stroke-muted-foreground/60" />
          <line
            x1={LADDER_AXIS_X - LADDER_GROUND_HALF_WIDTH}
            y1={groundY}
            x2={LADDER_AXIS_X + LADDER_GROUND_HALF_WIDTH}
            y2={groundY}
            strokeWidth="1.5"
            className="stroke-muted-foreground/60"
          />
          {heights.map((level, position) => {
            const levelY = getLevelY(level.heightMeters, highestMeters, groundY);
            return (
              <g key={level.heightMeters}>
                <line x1={LADDER_LINK_START_X} y1={levelY} x2={LADDER_LINK_END_X} y2={getLabelY(position)} className="stroke-muted-foreground/50" />
                <circle cx={LADDER_AXIS_X} cy={levelY} r={LADDER_DOT_RADIUS} strokeWidth="1.5" className="fill-foreground stroke-background" />
              </g>
            );
          })}
        </svg>
        <ul>
          {heights.map((level, position) => (
            <li
              key={level.heightMeters}
              className="absolute flex items-baseline gap-1.5 leading-[18px] whitespace-nowrap"
              style={{ left: LADDER_LABEL_LEFT, top: getLabelY(position) - LADDER_LABEL_HALF_HEIGHT }}
            >
              <span className="font-mono text-[12.5px] font-semibold tabular-nums">{format.meters(level.heightMeters)}</span>
              <span className="text-[11.5px] text-muted-foreground">{t("si2pemAntennaData.antennaCount", { count: level.antennaCount })}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
