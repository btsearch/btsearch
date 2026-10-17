import type { OfficialSite } from "@openbts/shared/contract";
import { useCallback, useMemo } from "react";

import { useMapPopup } from "./useMapPopup";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";

type StationPopupArgs = Omit<Parameters<typeof useMapPopup>[0], "onOpenStationDetails" | "onOpenOfficialSiteDetails">;

export function useStationPopupActions(args: StationPopupArgs) {
  const { openStationDialog, openOfficialSiteDialog } = useFloatingDialogStack();
  const openOfficialSiteDetails = useCallback((site: OfficialSite) => openOfficialSiteDialog(site.id, site), [openOfficialSiteDialog]);
  const { showPopup, followPoints, openLocations, popupContents, closePopups, cleanup } = useMapPopup({
    ...args,
    onOpenStationDetails: openStationDialog,
    onOpenOfficialSiteDetails: openOfficialSiteDetails,
  });
  const popupActions = useMemo(() => ({ show: showPopup, followPoints, cleanup }), [cleanup, followPoints, showPopup]);
  const stationActions = useMemo(() => ({ openDetails: openStationDialog, openOfficialSiteDetails }), [openStationDialog, openOfficialSiteDetails]);

  return { showPopup, openLocations, popupContents, closePopups, popupActions, stationActions };
}
