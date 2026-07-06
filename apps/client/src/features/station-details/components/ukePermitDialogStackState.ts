import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { UkeStation } from "@/types/station";

import { useFloatingDialogCoordinator } from "./floatingDialogCoordinator";
import { type StationDialogRect, areStationDialogRectsEqual, createInitialStationDialogRect } from "./stationDialogGeometry";

export type UkePermitDialogItem = {
  key: string;
  station: UkeStation;
  rect: StationDialogRect;
  zIndex: number;
};

const MAX_UKE_PERMIT_DIALOGS = 2;

function getUkePermitDialogKey(station: UkeStation) {
  return `uke:${station.id}`;
}

export function useUkePermitDialogStackState() {
  const { t } = useTranslation("common");
  const { getNextZIndex, isTopZIndex } = useFloatingDialogCoordinator();
  const [dialogs, setDialogs] = useState<UkePermitDialogItem[]>([]);
  const dialogsRef = useRef<UkePermitDialogItem[]>([]);

  const setDialogsSynced = useCallback((updater: (current: UkePermitDialogItem[]) => UkePermitDialogItem[]) => {
    const current = dialogsRef.current;
    const next = updater(current);
    if (next === current) return;
    dialogsRef.current = next;
    setDialogs(next);
  }, []);

  const focusUkePermitDialog = useCallback(
    (key: string) => {
      setDialogsSynced((current) => {
        const dialog = current.find((item) => item.key === key);
        if (dialog === undefined) return current;

        if (isTopZIndex(dialog.zIndex)) return current;

        const zIndex = getNextZIndex();
        return current.map((item) => (item.key === key ? { ...item, zIndex } : item));
      });
    },
    [getNextZIndex, isTopZIndex, setDialogsSynced],
  );

  const openUkePermitDialog = useCallback(
    (station: UkeStation) => {
      const key = getUkePermitDialogKey(station);
      const current = dialogsRef.current;
      if (current.some((dialog) => dialog.key === key)) {
        focusUkePermitDialog(key);
        return true;
      }

      if (current.length >= MAX_UKE_PERMIT_DIALOGS) {
        toast.info(t("toast.closeStationDialogFirst"));
        return false;
      }

      const dialog: UkePermitDialogItem = {
        key,
        station,
        rect: createInitialStationDialogRect(current.length),
        zIndex: getNextZIndex(),
      };
      setDialogsSynced((previous) => [...previous, dialog]);
      return true;
    },
    [focusUkePermitDialog, getNextZIndex, setDialogsSynced, t],
  );

  const closeUkePermitDialog = useCallback(
    (key: string) => {
      setDialogsSynced((current) => current.filter((dialog) => dialog.key !== key));
    },
    [setDialogsSynced],
  );

  const updateUkePermitDialogRect = useCallback(
    (key: string, rect: StationDialogRect) => {
      setDialogsSynced((current) => {
        const dialog = current.find((item) => item.key === key);
        if (dialog === undefined) return current;
        if (areStationDialogRectsEqual(dialog.rect, rect)) return current;
        return current.map((item) => (item.key === key ? { ...item, rect } : item));
      });
    },
    [setDialogsSynced],
  );

  return {
    dialogs,
    openUkePermitDialog,
    closeUkePermitDialog,
    focusUkePermitDialog,
    updateUkePermitDialogRect,
  };
}
