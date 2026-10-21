import type { OfficialSite } from "@openbts/shared/contract";
import { type ReactNode, Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useFloatingDialogStackState } from "../hooks/useFloatingDialogStackState";
import type { SI2PEMReportDialogPayload, StationHistoryDialogPayload, TerrainProfileDialogPayload } from "../types";
import type { DuplexMicrowaveLink } from "@/features/map/utils";
import type { TerrainProfileStationTarget } from "@/features/terrain-profile/types";
import type { StationSource } from "@/types/station";

type FloatingDialogStackContextValue = {
  openStationDialog: (id: number, source: StationSource, locationId?: number) => boolean;
  openOfficialSiteDialog: (id: number, officialSite?: OfficialSite) => boolean;
  openMicrowaveLinkDialog: (link: DuplexMicrowaveLink) => boolean;
  openSI2PEMReportDialog: (payload: SI2PEMReportDialogPayload) => boolean;
  openStationHistoryDialog: (payload: StationHistoryDialogPayload) => boolean;
  openTerrainProfileDialog: (payload: TerrainProfileDialogPayload) => boolean;
  closeTerrainProfileDialog: () => void;
  focusTerrainProfileDialog: () => void;
  setTerrainProfileStartHandler: (handler: ((station: TerrainProfileStationTarget) => void) | null) => void;
};

const FloatingDialogStackContext = createContext<FloatingDialogStackContextValue | null>(null);

const loadFloatingDialogStack = () => import("./floatingDialogStack");
const FloatingDialogStack = lazy(() => loadFloatingDialogStack().then((module) => ({ default: module.FloatingDialogStack })));

export function FloatingDialogStackProvider({ children }: { children: ReactNode }) {
  const stack = useFloatingDialogStackState();
  const [hasOpenedDialog, setHasOpenedDialog] = useState(false);
  const [terrainProfileStartHandler, setTerrainProfileStartHandlerState] = useState<((station: TerrainProfileStationTarget) => void) | null>(null);
  if (!hasOpenedDialog && stack.dialogs.length > 0) setHasOpenedDialog(true);

  useEffect(() => {
    void loadFloatingDialogStack();
  }, []);

  const setTerrainProfileStartHandler = useCallback((handler: ((station: TerrainProfileStationTarget) => void) | null) => {
    setTerrainProfileStartHandlerState(() => handler);
  }, []);
  const contextValue = useMemo(
    () => ({
      openStationDialog: stack.openStationDialog,
      openOfficialSiteDialog: stack.openOfficialSiteDialog,
      openMicrowaveLinkDialog: stack.openMicrowaveLinkDialog,
      openSI2PEMReportDialog: stack.openSI2PEMReportDialog,
      openStationHistoryDialog: stack.openStationHistoryDialog,
      openTerrainProfileDialog: stack.openTerrainProfileDialog,
      closeTerrainProfileDialog: stack.closeTerrainProfileDialog,
      focusTerrainProfileDialog: stack.focusTerrainProfileDialog,
      setTerrainProfileStartHandler,
    }),
    [
      setTerrainProfileStartHandler,
      stack.closeTerrainProfileDialog,
      stack.focusTerrainProfileDialog,
      stack.openMicrowaveLinkDialog,
      stack.openOfficialSiteDialog,
      stack.openSI2PEMReportDialog,
      stack.openStationHistoryDialog,
      stack.openStationDialog,
      stack.openTerrainProfileDialog,
    ],
  );

  return (
    <FloatingDialogStackContext.Provider value={contextValue}>
      {children}
      {hasOpenedDialog ? (
        <Suspense fallback={null}>
          <FloatingDialogStack
            dialogs={stack.dialogs}
            onClose={stack.requestCloseDialog}
            onFocus={stack.focusDialog}
            onRectChange={stack.updateDialogRect}
            onSwitchStation={stack.switchStationDialog}
            onStartTerrainProfile={terrainProfileStartHandler}
          />
        </Suspense>
      ) : null}
    </FloatingDialogStackContext.Provider>
  );
}

export function useFloatingDialogStack() {
  const context = useContext(FloatingDialogStackContext);
  if (context === null) throw new Error("useFloatingDialogStack must be used within FloatingDialogStackProvider");
  return context;
}
