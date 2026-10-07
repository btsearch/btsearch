import { Cancel01Icon, MinusSignIcon, WorkHistoryIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { EmfAntenna } from "../types";
import type { AntennaComparison } from "./antennaComparison";
import { getAntennaSummary, getGroupDirectionName, useAntennaFormat } from "./antennaFormat";
import { CHANGE_TONE_CLASS, LIST_COLUMN_CLASS, LIST_STACK_CLASS, TABLE_ROW_GRID_CLASS } from "./antennaLayout";
import type { AntennaGroup, TiltScale } from "./antennaModel";
import { AntennaGroupBlock } from "./antennaRows";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const KEYBOARD_CLICK_DETAIL = 0;
const COLUMN_HEADER_ROW_CLASS = cn(TABLE_ROW_GRID_CLASS, "items-center px-[13px] pt-1 text-[11.5px] font-semibold leading-4 text-muted-foreground");
const DIRECTION_CHIP_CLASS = cn(
  "inline-flex h-[22px] cursor-pointer items-center gap-1 rounded-full bg-primary pr-1.5 pl-2 text-[11.5px] font-semibold leading-none",
  "text-primary-foreground outline-none transition-colors hover:bg-primary/90 motion-reduce:transition-none",
  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
);

type AntennaListProps = {
  groups: readonly AntennaGroup[];
  antennaCount: number;
  selectedGroup: AntennaGroup | null;
  onClearSelection: (isKeyboardClick: boolean) => void;
  comparison: AntennaComparison | null;
  comparisonNotice: ReactNode;
  tiltScale: TiltScale;
  color: string | null;
  isPhone: boolean;
};

type AntennaListHeadProps = Pick<AntennaListProps, "antennaCount" | "selectedGroup" | "onClearSelection" | "comparison" | "isPhone"> & {
  azimuthCount: number;
};

type SelectedDirectionChipProps = {
  group: AntennaGroup;
  onClear: (isKeyboardClick: boolean) => void;
};

type ComparisonSummaryProps = {
  comparison: AntennaComparison;
};

type RemovedAntennasProps = {
  antennas: readonly EmfAntenna[];
  isPhone: boolean;
};

export function AntennaList({
  groups,
  antennaCount,
  selectedGroup,
  onClearSelection,
  comparison,
  comparisonNotice,
  tiltScale,
  color,
  isPhone,
}: AntennaListProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const shownGroups = selectedGroup === null ? groups : [selectedGroup];
  const previousAntennas = comparison === null ? null : comparison.previousAntennas;
  const blocks = shownGroups.map((group) => (
    <AntennaGroupBlock key={group.key} group={group} isPhone={isPhone} color={color} tiltScale={tiltScale} previousAntennas={previousAntennas} />
  ));

  return (
    <div className={isPhone ? LIST_STACK_CLASS : LIST_COLUMN_CLASS}>
      <AntennaListHead
        antennaCount={antennaCount}
        azimuthCount={groups.filter((group) => group.kind === "azimuth").length}
        selectedGroup={selectedGroup}
        onClearSelection={onClearSelection}
        comparison={comparison}
        isPhone={isPhone}
      />
      {comparisonNotice}
      {isPhone ? (
        <div className="flex flex-col gap-2 px-2 pb-2">{blocks}</div>
      ) : (
        <div role="table" aria-label={t("si2pemAntennaData.tableLabel")} className="flex flex-col gap-2 px-3 pb-3">
          <div role="rowgroup">
            <div role="row" className={COLUMN_HEADER_ROW_CLASS}>
              <span role="columnheader" aria-label={t("common:labels.height")}>
                {t("si2pemAntennaData.columns.height")}
              </span>
              <span role="columnheader">{t("si2pemAntennaData.columns.antenna")}</span>
              <span role="columnheader">{t("si2pemAntennaData.columns.bands")}</span>
              <span role="columnheader" className="col-span-2">
                {t("si2pemAntennaData.columns.tilt")}
              </span>
              <span role="columnheader" className="text-right">
                EIRP
              </span>
            </div>
          </div>
          {blocks}
        </div>
      )}
      {comparison !== null && comparison.removedAntennas.length > 0 ? (
        <RemovedAntennas antennas={comparison.removedAntennas} isPhone={isPhone} />
      ) : null}
    </div>
  );
}

function AntennaListHead({ antennaCount, azimuthCount, selectedGroup, onClearSelection, comparison, isPhone }: AntennaListHeadProps) {
  const { t } = useTranslation("stationDetails");
  const countText =
    selectedGroup === null
      ? t("si2pemAntennaData.antennaCount", { count: antennaCount })
      : t("si2pemAntennaData.antennaCountOf", { shown: selectedGroup.entries.length, count: antennaCount });

  return (
    <div
      className={cn(
        "flex min-h-8.5 flex-wrap items-center gap-x-2 gap-y-1 pt-2 pb-0.5 text-xs leading-4 text-muted-foreground",
        isPhone ? "px-2.5" : "pr-3 pl-3.5",
      )}
    >
      <p aria-live="polite" className="whitespace-nowrap">
        <span className="font-semibold text-foreground">{countText}</span>
        {azimuthCount > 0 ? (
          <>
            <span aria-hidden="true"> · </span>
            <span className="sr-only">, </span>
            {t("si2pemAntennaData.directionCount", { count: azimuthCount })}
          </>
        ) : null}
      </p>
      {selectedGroup === null ? null : <SelectedDirectionChip group={selectedGroup} onClear={onClearSelection} />}
      {comparison === null ? null : <ComparisonSummary comparison={comparison} />}
    </div>
  );
}

function SelectedDirectionChip({ group, onClear }: SelectedDirectionChipProps) {
  const { t } = useTranslation("stationDetails");
  const format = useAntennaFormat();
  const clearLabel = t("si2pemAntennaData.showAllDirections");

  return (
    <Tooltip>
      <TooltipTrigger
        render={<button type="button" className={DIRECTION_CHIP_CLASS} onClick={(event) => onClear(event.detail === KEYBOARD_CLICK_DETAIL)} />}
      >
        {getGroupDirectionName(group, format, t)}
        <span className="sr-only">, {clearLabel}</span>
        <HugeiconsIcon icon={Cancel01Icon} className="size-3" aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{clearLabel}</TooltipContent>
    </Tooltip>
  );
}

function ComparisonSummary({ comparison }: ComparisonSummaryProps) {
  const { t } = useTranslation("stationDetails");
  const { addedCount, changedCount, removedAntennas } = comparison;
  const changes = [
    addedCount > 0 ? t("si2pemAntennaData.comparison.added", { count: addedCount }) : null,
    changedCount > 0 ? t("si2pemAntennaData.comparison.changed", { count: changedCount }) : null,
    removedAntennas.length > 0 ? t("si2pemAntennaData.comparison.removed", { count: removedAntennas.length }) : null,
  ].filter((change) => change !== null);

  return (
    <p role="status" className={cn("ml-auto inline-flex min-w-0 items-center gap-1.5", CHANGE_TONE_CLASS)}>
      <HugeiconsIcon icon={WorkHistoryIcon} className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{changes.length > 0 ? changes.join(", ") : t("si2pemAntennaData.comparison.unchanged")}</span>
    </p>
  );
}

function RemovedAntennas({ antennas, isPhone }: RemovedAntennasProps) {
  const { t } = useTranslation("stationDetails");
  const format = useAntennaFormat();
  const names = antennas.map((antenna) => getAntennaSummary(antenna, format, t)).join(", ");

  return (
    <p className={cn("flex items-start gap-1.5 pb-3 text-xs leading-4 text-muted-foreground", isPhone ? "px-2.5" : "px-3.5")}>
      <HugeiconsIcon icon={MinusSignIcon} className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      <span>{t("si2pemAntennaData.comparison.missing", { antennas: names })}</span>
    </p>
  );
}
