import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

import type { DuplexRadioLink } from "@/features/map/utils";
import type { TerrainProfileStationTarget } from "@/features/terrain-profile/types";
import type { StationSource, UkeStation } from "@/types/station";

import { FloatingDialogStack } from "./floatingDialogStack";
import { useFloatingDialogStackState } from "./floatingDialogStackState";
import type { SI2PEMReportDialogPayload } from "./floatingDialogStackTypes";

type FloatingDialogStackContextValue = {
  openStationDialog: (id: number, source: StationSource) => boolean;
  openUkePermitDialog: (station: UkeStation) => boolean;
  openRadioLineDialog: (link: DuplexRadioLink) => boolean;
  openSI2PEMReportDialog: (payload: SI2PEMReportDialogPayload) => boolean;
  setTerrainProfileStartHandler: (handler: ((station: TerrainProfileStationTarget) => void) | null) => void;
};

const FloatingDialogStackContext = createContext<FloatingDialogStackContextValue | null>(null);

export function FloatingDialogStackProvider({ children }: { children: ReactNode }) {
  const stack = useFloatingDialogStackState();
  const [terrainProfileStartHandler, setTerrainProfileStartHandlerState] = useState<((station: TerrainProfileStationTarget) => void) | null>(null);
  const setTerrainProfileStartHandler = useCallback((handler: ((station: TerrainProfileStationTarget) => void) | null) => {
    setTerrainProfileStartHandlerState(() => handler);
  }, []);
  const contextValue = useMemo(
    () => ({
      openStationDialog: stack.openStationDialog,
      openUkePermitDialog: stack.openUkePermitDialog,
      openRadioLineDialog: stack.openRadioLineDialog,
      openSI2PEMReportDialog: stack.openSI2PEMReportDialog,
      setTerrainProfileStartHandler,
    }),
    [setTerrainProfileStartHandler, stack.openRadioLineDialog, stack.openSI2PEMReportDialog, stack.openStationDialog, stack.openUkePermitDialog],
  );

  return (
    <FloatingDialogStackContext.Provider value={contextValue}>
      {children}
      {stack.dialogs.length > 0 ? (
        <FloatingDialogStack
          dialogs={stack.dialogs}
          onClose={stack.closeDialog}
          onFocus={stack.focusDialog}
          onRectChange={stack.updateDialogRect}
          onStartTerrainProfile={terrainProfileStartHandler}
        />
      ) : null}
    </FloatingDialogStackContext.Provider>
  );
}

export function useFloatingDialogStack() {
  const context = useContext(FloatingDialogStackContext);
  if (context === null) throw new Error("useFloatingDialogStack must be used within FloatingDialogStackProvider");
  return context;
}
