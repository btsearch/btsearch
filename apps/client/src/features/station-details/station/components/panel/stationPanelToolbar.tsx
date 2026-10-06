import { Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { stationDialogInlineActionClassName } from "../../../components/stationDialogActionBar";
import { StationDialogActions } from "../../../components/stationDialogShell";
import type { StationRecord } from "../../types";
import { getStationCountryCode, toV1OperatorMnc } from "../../utils/stations";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { getStationHistoryTriggerId } from "@/features/floating-dialogs/types";
import type { TerrainProfileStationTarget } from "@/features/terrain-profile/types";
import { cn } from "@/lib/utils";

type StationPanelToolbarProps = {
  station: StationRecord;
  onStartTerrainProfile?: (station: TerrainProfileStationTarget) => void;
  onClose: () => void;
};

export function StationPanelToolbar({ station, onStartTerrainProfile, onClose }: StationPanelToolbarProps) {
  const { t } = useTranslation(["stationDetails", "main"]);
  const { openStationHistoryDialog } = useFloatingDialogStack();
  const operatorName = station.operator?.name ?? t("main:unknownOperator");

  return (
    <>
      <button
        id={getStationHistoryTriggerId(station.id)}
        type="button"
        aria-haspopup="dialog"
        onClick={() =>
          openStationHistoryDialog({
            stationId: station.id,
            stationCode: station.siteId,
            operatorName,
            operatorMnc: toV1OperatorMnc(station.operator),
          })
        }
        className={cn(stationDialogInlineActionClassName, "w-auto px-1.5")}
      >
        <HugeiconsIcon icon={Clock01Icon} className="size-3.5" aria-hidden="true" />
        <span className="whitespace-nowrap text-xs font-medium leading-none">{t("history.action")}</span>
      </button>
      <StationDialogActions
        source="internal"
        id={station.id}
        stationCode={station.siteId}
        operatorId={station.operatorId}
        operatorName={operatorName}
        countryCode={getStationCountryCode(station)}
        location={station.location}
        onStartTerrainProfile={onStartTerrainProfile}
        onClose={onClose}
      />
    </>
  );
}
