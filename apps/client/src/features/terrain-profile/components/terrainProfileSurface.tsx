import { useEffect, useEffectEvent, useRef } from "react";

import type { TerrainProfilePanelModel } from "../hooks/useTerrainProfileController";
import { type TerrainPanelStore, createTerrainPanelStore } from "../panelStore";
import { preloadTerrainProfileChart } from "./terrainProfileFigure";
import { TerrainProfileReceiverMarker } from "./terrainProfileReceiverMarker";
import { TerrainProfileSheet } from "./terrainProfileSheet";
import { TerrainProfileWindow } from "./terrainProfileWindow";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { FLOATING_DIALOG_DESKTOP_MIN_WIDTH } from "@/features/floating-dialogs/geometry";
import type { TerrainProfileDialogPayload } from "@/features/floating-dialogs/types";
import { useIsMobile } from "@/hooks/useMobile";
import { useNavMode } from "@/hooks/usePreferences";
import { cn } from "@/lib/utils";

type TerrainProfileSurfaceProps = {
  panel: TerrainProfilePanelModel | null;
};

type OpenedWindow = {
  store: TerrainPanelStore;
  payload: TerrainProfileDialogPayload;
};

const WINDOW_OPENING_HEIGHT = 360;
const WINDOW_OPENING_PLACE_CLASS = "pointer-events-none invisible absolute inset-x-14 mx-auto h-0 max-w-6xl";
const WINDOW_OPENING_BOTTOM_CLASS = "bottom-11";
const FLOATING_NAV_CLEARANCE_CLASS = "bottom-[calc(2.5rem+var(--floating-nav-map-offset,0rem))]";

export default function TerrainProfileSurface({ panel }: TerrainProfileSurfaceProps) {
  const isMobile = useIsMobile();
  const navMode = useNavMode();
  const { openTerrainProfileDialog, closeTerrainProfileDialog } = useFloatingDialogStack();
  const openingPlaceRef = useRef<HTMLDivElement>(null);
  const openedWindowRef = useRef<OpenedWindow | null>(null);
  const station = panel?.station ?? null;
  const isCollapsed = panel?.isCollapsed ?? false;
  const isPickingPoint = panel?.isPickingPoint ?? false;
  const hasReceiver = panel !== null && panel.receiverPoint !== null;
  const cancelPointPick = panel?.cancelPointPick;

  const openWindow = useEffectEvent((): OpenedWindow | null => {
    const openingPlace = openingPlaceRef.current?.getBoundingClientRect();
    if (panel === null || openingPlace === undefined) return null;

    const store = createTerrainPanelStore(panel);
    const width = Math.max(openingPlace.width, FLOATING_DIALOG_DESKTOP_MIN_WIDTH);
    const payload: TerrainProfileDialogPayload = {
      placement: {
        x: openingPlace.left - (width - openingPlace.width) / 2,
        y: openingPlace.bottom - WINDOW_OPENING_HEIGHT,
        width,
        height: WINDOW_OPENING_HEIGHT,
      },
      isCollapsed: panel.isCollapsed,
      renderPanel: (frame) => <TerrainProfileWindow store={store} frame={frame} />,
      onRequestClose: () => store.get().close(),
    };
    openTerrainProfileDialog(payload);
    return { store, payload };
  });

  useEffect(() => {
    if (station === null || isMobile) return;

    openedWindowRef.current = openWindow();
    return () => {
      openedWindowRef.current = null;
      closeTerrainProfileDialog();
    };
  }, [closeTerrainProfileDialog, isMobile, station]);

  useEffect(() => {
    if (panel !== null) openedWindowRef.current?.store.set(panel);
  }, [panel]);

  useEffect(() => {
    const openedWindow = openedWindowRef.current;
    if (openedWindow !== null) openTerrainProfileDialog({ ...openedWindow.payload, isCollapsed });
  }, [isCollapsed, openTerrainProfileDialog]);

  useEffect(() => {
    if (hasReceiver) preloadTerrainProfileChart();
  }, [hasReceiver]);

  useEffect(() => {
    if (!isPickingPoint || cancelPointPick === undefined) return;
    const cancel = cancelPointPick;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancel();
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [cancelPointPick, isPickingPoint]);

  return (
    <>
      {panel !== null && panel.receiverPoint !== null ? (
        <TerrainProfileReceiverMarker
          point={panel.receiverPoint}
          heightMeters={panel.receiverHeightMeters}
          onDrag={panel.previewReceiver}
          onDragEnd={panel.placeReceiver}
        />
      ) : null}
      {isMobile ? (
        <TerrainProfileSheet panel={panel} />
      ) : (
        <div
          ref={openingPlaceRef}
          aria-hidden="true"
          className={cn(WINDOW_OPENING_PLACE_CLASS, navMode === "floating" ? FLOATING_NAV_CLEARANCE_CLASS : WINDOW_OPENING_BOTTOM_CLASS)}
        />
      )}
    </>
  );
}
