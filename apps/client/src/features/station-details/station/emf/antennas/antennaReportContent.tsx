import { type ReactNode, useRef } from "react";

import type { EmfAntenna } from "../types";
import { compareAntennaReports } from "./antennaComparison";
import { BODY_COLUMNS_CLASS, BODY_STACK_CLASS } from "./antennaLayout";
import { AntennaList } from "./antennaList";
import { getTiltScale, groupAntennasByAzimuth, listHeightLevels } from "./antennaModel";
import { AntennaOverview } from "./antennaOverview";

type AntennaReportContentProps = {
  antennas: readonly EmfAntenna[];
  olderAntennas?: readonly EmfAntenna[];
  comparisonNotice: ReactNode;
  color: string | null;
  selectedGroupKey: string | null;
  onSelectedGroupKeyChange: (groupKey: string | null) => void;
  isPhone: boolean;
};

export function AntennaReportContent({
  antennas,
  olderAntennas,
  comparisonNotice,
  color,
  selectedGroupKey,
  onSelectedGroupKeyChange,
  isPhone,
}: AntennaReportContentProps) {
  const selectedDirectionLabelRef = useRef<HTMLButtonElement>(null);
  const groups = groupAntennasByAzimuth(antennas);
  const selectedGroup = groups.find((group) => group.key === selectedGroupKey && group.kind !== "undirected") ?? null;

  function clearSelection(isKeyboardClick: boolean) {
    if (isKeyboardClick) selectedDirectionLabelRef.current?.focus();
    onSelectedGroupKeyChange(null);
  }

  return (
    <div className={isPhone ? BODY_STACK_CLASS : BODY_COLUMNS_CLASS}>
      <AntennaOverview
        groups={groups}
        heights={listHeightLevels(antennas)}
        color={color}
        selectedGroup={selectedGroup}
        onSelectedGroupKeyChange={onSelectedGroupKeyChange}
        selectedDirectionLabelRef={selectedDirectionLabelRef}
        isPhone={isPhone}
      />
      <AntennaList
        groups={groups}
        antennaCount={antennas.length}
        selectedGroup={selectedGroup}
        onClearSelection={clearSelection}
        comparison={olderAntennas === undefined ? null : compareAntennaReports(antennas, olderAntennas)}
        comparisonNotice={comparisonNotice}
        tiltScale={getTiltScale(antennas)}
        color={color}
        isPhone={isPhone}
      />
    </div>
  );
}
