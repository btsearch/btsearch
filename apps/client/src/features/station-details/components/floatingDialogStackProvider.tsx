import { type ReactNode, createContext, useContext, useMemo } from "react";

import type { DuplexRadioLink } from "@/features/map/utils";
import type { StationSource, UkeStation } from "@/types/station";

import { FloatingDialogStack } from "./floatingDialogStack";
import { useFloatingDialogStackState } from "./floatingDialogStackState";
import type { SI2PEMReportDialogPayload } from "./floatingDialogStackTypes";

type FloatingDialogStackContextValue = {
  openStationDialog: (id: number, source: StationSource) => boolean;
  openUkePermitDialog: (station: UkeStation) => boolean;
  openRadioLineDialog: (link: DuplexRadioLink) => boolean;
  openSI2PEMReportDialog: (payload: SI2PEMReportDialogPayload) => boolean;
};

const FloatingDialogStackContext = createContext<FloatingDialogStackContextValue | null>(null);

export function FloatingDialogStackProvider({ children }: { children: ReactNode }) {
  const stack = useFloatingDialogStackState();
  const contextValue = useMemo(
    () => ({
      openStationDialog: stack.openStationDialog,
      openUkePermitDialog: stack.openUkePermitDialog,
      openRadioLineDialog: stack.openRadioLineDialog,
      openSI2PEMReportDialog: stack.openSI2PEMReportDialog,
    }),
    [stack.openRadioLineDialog, stack.openSI2PEMReportDialog, stack.openStationDialog, stack.openUkePermitDialog],
  );

  return (
    <FloatingDialogStackContext.Provider value={contextValue}>
      {children}
      {stack.dialogs.length > 0 ? (
        <FloatingDialogStack dialogs={stack.dialogs} onClose={stack.closeDialog} onFocus={stack.focusDialog} onRectChange={stack.updateDialogRect} />
      ) : null}
    </FloatingDialogStackContext.Provider>
  );
}

export function useFloatingDialogStack() {
  const context = useContext(FloatingDialogStackContext);
  if (context === null) throw new Error("useFloatingDialogStack must be used within FloatingDialogStackProvider");
  return context;
}
