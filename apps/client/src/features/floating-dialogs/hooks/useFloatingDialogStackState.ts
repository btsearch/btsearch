import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { type FloatingDialogRect, areFloatingDialogRectsEqual, createInitialFloatingDialogRect } from "../geometry";
import { assertNever, getTopDialog } from "../types";
import type { FloatingDialogItem, FloatingDialogOpenRequest, SI2PEMReportDialogPayload, StationHistoryDialogPayload } from "../types";
import type { DuplexRadioLink } from "@/features/map/utils";
import type { TabId } from "@/features/station-details/tabs";
import type { StationSource, UkeStation } from "@/types/station";

const FLOATING_DIALOG_Z_INDEX_BASE = 40;
const MAX_DIALOGS_PER_KIND = 2;

function getNextZIndex(dialogs: FloatingDialogItem[]): number {
  return (getTopDialog(dialogs)?.zIndex ?? FLOATING_DIALOG_Z_INDEX_BASE) + 1;
}

function normalizeZIndexes(dialogs: FloatingDialogItem[]): FloatingDialogItem[] {
  const ordered = dialogs.slice().sort((a, b) => a.zIndex - b.zIndex);
  return dialogs.map((dialog) => {
    const zIndex = FLOATING_DIALOG_Z_INDEX_BASE + 1 + ordered.indexOf(dialog);
    return dialog.zIndex === zIndex ? dialog : { ...dialog, zIndex };
  });
}

type ResolvedDialogRequest = {
  key: string;
  matchesPayload: (dialog: FloatingDialogItem) => boolean;
  create: (rect: FloatingDialogRect, zIndex: number) => FloatingDialogItem;
  update: (dialog: FloatingDialogItem, zIndex: number) => FloatingDialogItem;
};

function resolveDialogRequest(request: FloatingDialogOpenRequest): ResolvedDialogRequest {
  switch (request.kind) {
    case "station": {
      const key = `station:${request.source}:${request.id}`;
      return {
        key,
        matchesPayload: (dialog) => dialog.kind === "station",
        create: (rect, zIndex) => ({ ...request, key, rect, zIndex }),
        update: (dialog, zIndex) => (dialog.kind === "station" ? { ...dialog, zIndex } : dialog),
      };
    }
    case "uke-permit": {
      const key = `uke-permit:${request.station.id}`;
      return {
        key,
        matchesPayload: (dialog) => dialog.kind === "uke-permit" && dialog.station === request.station,
        create: (rect, zIndex) => ({ kind: "uke-permit", key, station: request.station, rect, zIndex }),
        update: (dialog, zIndex) => (dialog.kind === "uke-permit" ? { ...dialog, station: request.station, zIndex } : dialog),
      };
    }
    case "radioline": {
      const key = `radioline:${request.link.groupId}`;
      return {
        key,
        matchesPayload: (dialog) => dialog.kind === "radioline" && dialog.link === request.link,
        create: (rect, zIndex) => ({ kind: "radioline", key, link: request.link, rect, zIndex }),
        update: (dialog, zIndex) => (dialog.kind === "radioline" ? { ...dialog, link: request.link, zIndex } : dialog),
      };
    }
    case "si2pem-report": {
      const key = `si2pem-report:${request.report.details.document_url}`;
      return {
        key,
        matchesPayload: (dialog) =>
          dialog.kind === "si2pem-report" &&
          dialog.report === request.report &&
          dialog.latitude === request.latitude &&
          dialog.longitude === request.longitude &&
          dialog.operatorName === request.operatorName &&
          dialog.operatorMnc === request.operatorMnc,
        create: (rect, zIndex) => ({
          kind: "si2pem-report",
          key,
          report: request.report,
          latitude: request.latitude,
          longitude: request.longitude,
          operatorName: request.operatorName,
          operatorMnc: request.operatorMnc,
          rect,
          zIndex,
        }),
        update: (dialog, zIndex) => (dialog.kind === "si2pem-report" ? { ...dialog, ...request, zIndex } : dialog),
      };
    }
    case "station-history": {
      const key = `station-history:${request.stationId}`;
      return {
        key,
        matchesPayload: (dialog) =>
          dialog.kind === "station-history" &&
          dialog.stationId === request.stationId &&
          dialog.stationCode === request.stationCode &&
          dialog.operatorName === request.operatorName &&
          dialog.operatorMnc === request.operatorMnc,
        create: (rect, zIndex) => ({
          kind: "station-history",
          key,
          stationId: request.stationId,
          stationCode: request.stationCode,
          operatorName: request.operatorName,
          operatorMnc: request.operatorMnc,
          rect,
          zIndex,
        }),
        update: (dialog, zIndex) => (dialog.kind === "station-history" ? { ...dialog, ...request, zIndex } : dialog),
      };
    }
    default:
      return assertNever(request);
  }
}

export function useFloatingDialogStackState() {
  const { t } = useTranslation("common");
  const [dialogs, setDialogs] = useState<FloatingDialogItem[]>([]);
  const dialogsRef = useRef<FloatingDialogItem[]>([]);

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
      const resolved = resolveDialogRequest(request);
      const current = dialogsRef.current;
      const existingDialog = current.find((dialog) => dialog.key === resolved.key);

      if (existingDialog !== undefined) {
        const isTopDialog = getTopDialog(current)?.key === resolved.key;
        if (isTopDialog && resolved.matchesPayload(existingDialog)) return true;

        const zIndex = isTopDialog ? existingDialog.zIndex : getNextZIndex(current);
        setDialogsSynced((previous) => previous.map((dialog) => (dialog.key === resolved.key ? resolved.update(dialog, zIndex) : dialog)));
        return true;
      }

      const familyCount = current.filter((dialog) => dialog.kind === request.kind).length;
      if (familyCount >= MAX_DIALOGS_PER_KIND) {
        toast.info(t("toast.closeStationDialogFirst"));
        return false;
      }

      const initialSize =
        request.kind === "si2pem-report" ? { width: 730, height: 800 } : request.kind === "station-history" ? { width: 900, height: 680 } : undefined;
      const dialog = resolved.create(createInitialFloatingDialogRect(familyCount, initialSize), getNextZIndex(current));
      setDialogsSynced((previous) => [...previous, dialog]);
      return true;
    },
    [setDialogsSynced, t],
  );

  const openStationDialog = useCallback(
    (id: number, source: StationSource, initialTab?: TabId) => openDialog({ kind: "station", id, source, initialTab }),
    [openDialog],
  );

  const openUkePermitDialog = useCallback((station: UkeStation) => openDialog({ kind: "uke-permit", station }), [openDialog]);

  const openRadioLineDialog = useCallback((link: DuplexRadioLink) => openDialog({ kind: "radioline", link }), [openDialog]);

  const openSI2PEMReportDialog = useCallback((payload: SI2PEMReportDialogPayload) => openDialog({ kind: "si2pem-report", ...payload }), [openDialog]);

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

      event.preventDefault();
      closeDialog(topDialog.key);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeDialog]);

  return {
    dialogs,
    openStationDialog,
    openUkePermitDialog,
    openRadioLineDialog,
    openSI2PEMReportDialog,
    openStationHistoryDialog,
    closeDialog,
    focusDialog,
    updateDialogRect,
  };
}
