import { useMemo } from "react";

import { useMapPopup } from "./useMapPopup";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";

type StationPopupArgs = Omit<Parameters<typeof useMapPopup>[0], "onOpenStationDetails" | "onOpenUkeStationDetails">;

export function useStationPopupActions(args: StationPopupArgs) {
  const { openStationDialog, openUkePermitDialog } = useFloatingDialogStack();
  const { showPopup, followPoints, openLocations, popupContents, closePopups, cleanup } = useMapPopup({
    ...args,
    onOpenStationDetails: openStationDialog,
    onOpenUkeStationDetails: openUkePermitDialog,
  });
  const popupActions = useMemo(() => ({ show: showPopup, followPoints, cleanup }), [cleanup, followPoints, showPopup]);
  const stationActions = useMemo(
    () => ({ openDetails: openStationDialog, openUkeDetails: openUkePermitDialog }),
    [openStationDialog, openUkePermitDialog],
  );

  return { showPopup, openLocations, popupContents, closePopups, popupActions, stationActions };
}
