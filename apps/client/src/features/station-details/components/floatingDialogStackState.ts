import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import type { DuplexRadioLink } from "@/features/map/utils";
import type { StationSource, UkeStation } from "@/types/station";

import { assertNever } from "./floatingDialogStackTypes";
import type { FloatingDialogItem, FloatingDialogOpenRequest } from "./floatingDialogStackTypes";
import { type StationDialogRect, areStationDialogRectsEqual, createInitialStationDialogRect } from "./stationDialogGeometry";

const FLOATING_DIALOG_Z_INDEX_BASE = 40;
const MAX_DIALOGS_PER_KIND = 2;

function getTopDialog(dialogs: FloatingDialogItem[]): FloatingDialogItem | undefined {
  let topDialog: FloatingDialogItem | undefined;
  for (const dialog of dialogs) {
    if (topDialog === undefined || dialog.zIndex > topDialog.zIndex) topDialog = dialog;
  }
  return topDialog;
}

type ResolvedDialogRequest = {
  key: string;
  matchesPayload: (dialog: FloatingDialogItem) => boolean;
  create: (rect: StationDialogRect, zIndex: number) => FloatingDialogItem;
  update: (dialog: FloatingDialogItem, zIndex: number) => FloatingDialogItem;
};

function resolveDialogRequest(request: FloatingDialogOpenRequest): ResolvedDialogRequest {
  switch (request.kind) {
    case "station": {
      const key = `station:${request.source}:${request.id}`;
      return {
        key,
        matchesPayload: (dialog) => dialog.kind === "station",
        create: (rect, zIndex) => ({ kind: "station", key, id: request.id, source: request.source, rect, zIndex }),
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
    default:
      return assertNever(request);
  }
}

export function useFloatingDialogStackState() {
  const { t } = useTranslation("common");
  const [dialogs, setDialogs] = useState<FloatingDialogItem[]>([]);
  const dialogsRef = useRef<FloatingDialogItem[]>([]);
  const nextZIndexRef = useRef(FLOATING_DIALOG_Z_INDEX_BASE);

  const setDialogsSynced = useCallback((updater: (current: FloatingDialogItem[]) => FloatingDialogItem[]) => {
    const current = dialogsRef.current;
    const next = updater(current);
    if (next === current) return;
    dialogsRef.current = next;
    setDialogs(next);
  }, []);

  const getNextZIndex = useCallback(() => {
    nextZIndexRef.current += 1;
    return nextZIndexRef.current;
  }, []);

  const focusDialog = useCallback(
    (key: string) => {
      setDialogsSynced((current) => {
        const dialog = current.find((item) => item.key === key);
        if (dialog === undefined || getTopDialog(current)?.key === key) return current;

        const zIndex = getNextZIndex();
        return current.map((item) => (item.key === key ? { ...item, zIndex } : item));
      });
    },
    [getNextZIndex, setDialogsSynced],
  );

  const openDialog = useCallback(
    (request: FloatingDialogOpenRequest) => {
      const resolved = resolveDialogRequest(request);
      const current = dialogsRef.current;
      const existingDialog = current.find((dialog) => dialog.key === resolved.key);

      if (existingDialog !== undefined) {
        const isTopDialog = getTopDialog(current)?.key === resolved.key;
        if (isTopDialog && resolved.matchesPayload(existingDialog)) return true;

        const zIndex = isTopDialog ? existingDialog.zIndex : getNextZIndex();
        setDialogsSynced((previous) => previous.map((dialog) => (dialog.key === resolved.key ? resolved.update(dialog, zIndex) : dialog)));
        return true;
      }

      const familyCount = current.filter((dialog) => dialog.kind === request.kind).length;
      if (familyCount >= MAX_DIALOGS_PER_KIND) {
        toast.info(t("toast.closeStationDialogFirst"));
        return false;
      }

      const dialog = resolved.create(createInitialStationDialogRect(familyCount), getNextZIndex());
      setDialogsSynced((previous) => [...previous, dialog]);
      return true;
    },
    [getNextZIndex, setDialogsSynced, t],
  );

  const openStationDialog = useCallback((id: number, source: StationSource) => openDialog({ kind: "station", id, source }), [openDialog]);

  const openUkePermitDialog = useCallback((station: UkeStation) => openDialog({ kind: "uke-permit", station }), [openDialog]);

  const openRadioLineDialog = useCallback((link: DuplexRadioLink) => openDialog({ kind: "radioline", link }), [openDialog]);

  const closeDialog = useCallback(
    (key: string) => {
      setDialogsSynced((current) => current.filter((dialog) => dialog.key !== key));
    },
    [setDialogsSynced],
  );

  const updateDialogRect = useCallback(
    (key: string, rect: StationDialogRect) => {
      setDialogsSynced((current) => {
        const dialog = current.find((item) => item.key === key);
        if (dialog === undefined || areStationDialogRectsEqual(dialog.rect, rect)) return current;
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
    closeDialog,
    focusDialog,
    updateDialogRect,
  };
}
