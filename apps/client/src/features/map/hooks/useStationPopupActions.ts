import { useMemo } from "react";

import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";

import { useMapPopup } from "./useMapPopup";

type StationPopupArgs = Omit<Parameters<typeof useMapPopup>[0], "onOpenStationDetails" | "onOpenUkeStationDetails">;

export function useStationPopupActions(args: StationPopupArgs) {
  const { openStationDialog, openUkePermitDialog } = useFloatingDialogStack();
  const { showPopup, openLocations, closePopups, cleanup } = useMapPopup({
    ...args,
    onOpenStationDetails: openStationDialog,
    onOpenUkeStationDetails: openUkePermitDialog,
  });
  const popupActions = useMemo(() => ({ show: showPopup, cleanup }), [cleanup, showPopup]);
  const stationActions = useMemo(
    () => ({ openDetails: openStationDialog, openUkeDetails: openUkePermitDialog }),
    [openStationDialog, openUkePermitDialog],
  );

  return { showPopup, openLocations, closePopups, popupActions, stationActions };
}
