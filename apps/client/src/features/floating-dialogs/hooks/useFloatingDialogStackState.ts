import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { type FloatingDialogRect, areFloatingDialogRectsEqual, createInitialFloatingDialogRect } from "../geometry";
import { assertNever, getTopDialog } from "../types";
import type {
  FloatingDialogItem,
  FloatingDialogKind,
  FloatingDialogOpenRequest,
  SI2PEMReportDialogPayload,
  StationDialogTarget,
  StationHistoryDialogPayload,
  TerrainProfileDialogPayload,
} from "../types";
import type { DuplexRadioLink } from "@/features/map/utils";
import { isTextEntryTarget } from "@/features/terrain-profile/focus";
import type { StationSource, UkeStation } from "@/types/station";

const FLOATING_DIALOG_Z_INDEX_BASE = 40;
const MAX_DIALOGS_PER_KIND = 2;
const TERRAIN_PROFILE_DIALOG_KEY = "terrain-profile";
const TERRAIN_PROFILE_DIALOG_SELECTOR = `[data-floating-dialog-key="${TERRAIN_PROFILE_DIALOG_KEY}"]`;
const INITIAL_DIALOG_SIZES: Partial<Record<FloatingDialogKind, { width: number; height: number }>> = {
  "si2pem-report": { width: 1000, height: 540 },
  "station-history": { width: 900, height: 680 },
};

function getNextZIndex(dialogs: FloatingDialogItem[]): number {
  return (getTopDialog(dialogs)?.zIndex ?? FLOATING_DIALOG_Z_INDEX_BASE) + 1;
}

function getDialogFamily(dialog: FloatingDialogItem | FloatingDialogOpenRequest): string {
  return dialog.kind === "station" ? `station:${dialog.source}` : dialog.kind;
}

function normalizeZIndexes(dialogs: FloatingDialogItem[]): FloatingDialogItem[] {
  const ordered = dialogs.slice().sort((a, b) => a.zIndex - b.zIndex);
  return dialogs.map((dialog) => {
    const zIndex = FLOATING_DIALOG_Z_INDEX_BASE + 1 + ordered.indexOf(dialog);
    return dialog.zIndex === zIndex ? dialog : { ...dialog, zIndex };
  });
}

function getDialogKey(request: FloatingDialogOpenRequest): string {
  switch (request.kind) {
    case "station":
      return `station:${request.source}:${request.id}`;
    case "radioline":
      return `radioline:${request.link.groupId}`;
    case "si2pem-report":
      return `si2pem-report:${request.report.url}`;
    case "station-history":
      return `station-history:${request.stationId}`;
    case "terrain-profile":
      return TERRAIN_PROFILE_DIALOG_KEY;
    default:
      return assertNever(request);
  }
}

function hasSamePayload(dialog: FloatingDialogItem, request: FloatingDialogOpenRequest): boolean {
  switch (request.kind) {
    case "station":
      return dialog.kind === "station";
    case "radioline":
      return dialog.kind === "radioline" && dialog.link === request.link;
    case "si2pem-report":
      return false;
    case "station-history":
      return (
        dialog.kind === "station-history" &&
        dialog.stationId === request.stationId &&
        dialog.stationCode === request.stationCode &&
        dialog.operatorName === request.operatorName &&
        dialog.operatorMnc === request.operatorMnc
      );
    case "terrain-profile":
      return (
        dialog.kind === "terrain-profile" &&
        dialog.placement === request.placement &&
        dialog.isCollapsed === request.isCollapsed &&
        dialog.renderPanel === request.renderPanel
      );
    default:
      return assertNever(request);
  }
}

function isTypingOutsideTerrainProfileDialog(target: EventTarget | null): boolean {
  if (!(target instanceof Element) || !isTextEntryTarget(target)) return false;
  return target.closest(TERRAIN_PROFILE_DIALOG_SELECTOR) === null;
}

function createDialogRect(request: FloatingDialogOpenRequest, familyCount: number): FloatingDialogRect {
  if (request.kind === "terrain-profile") return request.placement;
  return createInitialFloatingDialogRect(familyCount, INITIAL_DIALOG_SIZES[request.kind]);
}

export function useFloatingDialogStackState() {
  const { t } = useTranslation("common");
  const [dialogs, setDialogs] = useState<FloatingDialogItem[]>([]);
  const dialogsRef = useRef<FloatingDialogItem[]>([]);
  const lastFrameIdRef = useRef(0);
  const lastReportOpenRequestIdRef = useRef(0);

  const setDialogsSynced = useCallback((updater: (current: FloatingDialogItem[]) => FloatingDialogItem[]) => {
    const current = dialogsRef.current;
    const next = updater(current);
    if (next === current) return;
    const normalized = normalizeZIndexes(next);
    dialogsRef.current = normalized;
    setDialogs(normalized);
  }, []);

  const focusDialog = useCallback(
    (key: string) => {
      setDialogsSynced((current) => {
        const dialog = current.find((item) => item.key === key);
        if (dialog === undefined || getTopDialog(current)?.key === key) return current;

        const zIndex = getNextZIndex(current);
        return current.map((item) => (item.key === key ? { ...item, zIndex } : item));
      });
    },
    [setDialogsSynced],
  );

  const openDialog = useCallback(
    (request: FloatingDialogOpenRequest) => {
      const key = getDialogKey(request);
      const current = dialogsRef.current;
      const existingDialog = current.find((dialog) => dialog.key === key);

      if (existingDialog !== undefined) {
        const isTopDialog = getTopDialog(current)?.key === key;
        if (isTopDialog && hasSamePayload(existingDialog, request)) return true;

        const zIndex = isTopDialog ? existingDialog.zIndex : getNextZIndex(current);
        setDialogsSynced((previous) => previous.map((dialog) => (dialog.key === key ? { ...dialog, ...request, zIndex } : dialog)));
        return true;
      }

      const family = getDialogFamily(request);
      const familyCount = current.filter((dialog) => getDialogFamily(dialog) === family).length;
      if (familyCount >= MAX_DIALOGS_PER_KIND) {
        toast.info(t("toast.closeStationDialogFirst"));
        return false;
      }

      lastFrameIdRef.current += 1;
      const dialog: FloatingDialogItem = {
        ...request,
        key,
        frameId: lastFrameIdRef.current,
        rect: createDialogRect(request, familyCount),
        zIndex: getNextZIndex(current),
      };
      setDialogsSynced((previous) => [...previous, dialog]);
      return true;
    },
    [setDialogsSynced, t],
  );

  const switchStationDialog = useCallback(
    (key: string, target: StationDialogTarget) => {
      const request: FloatingDialogOpenRequest = { kind: "station", ...target };
      const targetKey = getDialogKey(request);
      setDialogsSynced((current) => {
        const dialog = current.find((item) => item.key === key);
        if (dialog?.kind !== "station" || key === targetKey) return current;

        if (current.some((item) => item.key === targetKey)) {
          const zIndex = getNextZIndex(current);
          return current.filter((item) => item !== dialog).map((item) => (item.key === targetKey ? { ...item, zIndex } : item));
        }

        const switched: FloatingDialogItem = {
          ...request,
          switchedFrom: { id: dialog.id, source: dialog.source, ukeStation: dialog.ukeStation },
          key: targetKey,
          frameId: dialog.frameId,
          rect: dialog.rect,
          zIndex: dialog.zIndex,
        };
        return current.map((item) => (item === dialog ? switched : item));
      });
    },
    [setDialogsSynced],
  );

  const openStationDialog = useCallback(
    (id: number, source: StationSource, locationId?: number) => openDialog({ kind: "station", id, source, locationId }),
    [openDialog],
  );

  const openUkePermitDialog = useCallback(
    (station: UkeStation) => openDialog({ kind: "station", id: station.id, source: "uke", ukeStation: station }),
    [openDialog],
  );

  const openRadioLineDialog = useCallback((link: DuplexRadioLink) => openDialog({ kind: "radioline", link }), [openDialog]);

  const openSI2PEMReportDialog = useCallback(
    (payload: SI2PEMReportDialogPayload) => {
      lastReportOpenRequestIdRef.current += 1;
      return openDialog({ kind: "si2pem-report", ...payload, openRequestId: lastReportOpenRequestIdRef.current });
    },
    [openDialog],
  );

  const openStationHistoryDialog = useCallback(
    (payload: StationHistoryDialogPayload) => openDialog({ kind: "station-history", ...payload }),
    [openDialog],
  );

  const closeDialog = useCallback(
    (key: string) => {
      setDialogsSynced((current) => current.filter((dialog) => dialog.key !== key));
    },
    [setDialogsSynced],
  );

  const requestCloseDialog = useCallback(
    (key: string) => {
      const dialog = dialogsRef.current.find((item) => item.key === key);
      if (dialog?.kind === "terrain-profile") dialog.onRequestClose();
      else closeDialog(key);
    },
    [closeDialog],
  );

  const openTerrainProfileDialog = useCallback(
    (payload: TerrainProfileDialogPayload) => openDialog({ kind: "terrain-profile", ...payload }),
    [openDialog],
  );

  const closeTerrainProfileDialog = useCallback(() => closeDialog(TERRAIN_PROFILE_DIALOG_KEY), [closeDialog]);

  const focusTerrainProfileDialog = useCallback(() => focusDialog(TERRAIN_PROFILE_DIALOG_KEY), [focusDialog]);

  const updateDialogRect = useCallback(
    (key: string, rect: FloatingDialogRect) => {
      setDialogsSynced((current) => {
        const dialog = current.find((item) => item.key === key);
        if (dialog === undefined || areFloatingDialogRectsEqual(dialog.rect, rect)) return current;
        return current.map((item) => (item.key === key ? { ...item, rect } : item));
      });
    },
    [setDialogsSynced],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== "Escape") return;

      const topDialog = getTopDialog(dialogsRef.current);
      if (topDialog === undefined) return;
      if (topDialog.kind === "terrain-profile" && isTypingOutsideTerrainProfileDialog(event.target)) return;

      event.preventDefault();
      requestCloseDialog(topDialog.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestCloseDialog]);

  return {
    dialogs,
    switchStationDialog,
    openStationDialog,
    openUkePermitDialog,
    openRadioLineDialog,
    openSI2PEMReportDialog,
    openStationHistoryDialog,
    openTerrainProfileDialog,
    closeTerrainProfileDialog,
    focusTerrainProfileDialog,
    requestCloseDialog,
    focusDialog,
    updateDialogRect,
  };
}
