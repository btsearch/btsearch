import { type ComponentProps, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";

import { useIsMobile } from "@/hooks/useMobile";

import TerrainProfilePanel from "./terrainProfilePanel";

type TerrainProfileSurfaceProps = Omit<ComponentProps<typeof TerrainProfilePanel>, "headerDragProps">;

type Position = { x: number; y: number };
type DragState = { pointerId: number; startX: number; startY: number; origin: Position; next: Position; frameId: number | null };

const PANEL_MAX_WIDTH = 1152;
const PANEL_MARGIN = 16;
const PANEL_ESTIMATED_HEIGHT = 420;

function panelWidth() {
  return Math.min(PANEL_MAX_WIDTH, window.innerWidth - PANEL_MARGIN * 2);
}

function initialPosition(): Position {
  return {
    x: Math.max(PANEL_MARGIN, Math.round((window.innerWidth - panelWidth()) / 2)),
    y: Math.max(PANEL_MARGIN, window.innerHeight - PANEL_ESTIMATED_HEIGHT - PANEL_MARGIN),
  };
}

function clampPosition(position: Position, panel: HTMLDivElement | null): Position {
  const width = panel?.offsetWidth ?? panelWidth();
  const height = panel?.offsetHeight ?? PANEL_ESTIMATED_HEIGHT;
  return {
    x: Math.min(Math.max(position.x, PANEL_MARGIN), Math.max(PANEL_MARGIN, window.innerWidth - width - PANEL_MARGIN)),
    y: Math.min(Math.max(position.y, PANEL_MARGIN), Math.max(PANEL_MARGIN, window.innerHeight - height - PANEL_MARGIN)),
  };
}

export default function TerrainProfileSurface(props: TerrainProfileSurfaceProps) {
  const isMobile = useIsMobile();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const positionRef = useRef(initialPosition());

  const applyPosition = useCallback((next: Position) => {
    const panel = panelRef.current;
    if (panel === null) return;
    positionRef.current = next;
    panel.style.left = `${Math.round(next.x)}px`;
    panel.style.top = `${Math.round(next.y)}px`;
  }, []);

  useEffect(() => {
    const handleResize = () => applyPosition(clampPosition(positionRef.current, panelRef.current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [applyPosition]);

  useEffect(
    () => () => {
      const drag = dragRef.current;
      if (typeof drag?.frameId === "number") cancelAnimationFrame(drag.frameId);
      document.body.style.userSelect = "";
    },
    [],
  );

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("button,a,input,label,select,[role='combobox'],[role='listbox'],[role='option']") !== null) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.userSelect = "none";
    const origin = clampPosition(positionRef.current, panelRef.current);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin, next: origin, frameId: null };
  }, []);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) return;
      drag.next = clampPosition({ x: drag.origin.x + event.clientX - drag.startX, y: drag.origin.y + event.clientY - drag.startY }, panelRef.current);
      if (drag.frameId !== null) return;
      drag.frameId = requestAnimationFrame(() => {
        drag.frameId = null;
        applyPosition(drag.next);
      });
    },
    [applyPosition],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) return;
      if (drag.frameId !== null) cancelAnimationFrame(drag.frameId);
      dragRef.current = null;
      document.body.style.userSelect = "";
      applyPosition(drag.next);
    },
    [applyPosition],
  );

  const headerDragProps = useMemo(
    () => ({
      className: "cursor-grab touch-none select-none active:cursor-grabbing",
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
    }),
    [handlePointerDown, handlePointerMove, handlePointerUp],
  );

  const content = isMobile ? (
    <div className="pointer-events-auto fixed inset-x-2 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-40 max-h-[min(85dvh,calc(100dvh-4rem-env(safe-area-inset-bottom)))]">
      <TerrainProfilePanel {...props} />
    </div>
  ) : (
    <div
      ref={panelRef}
      className="pointer-events-auto fixed z-40 max-h-[min(60dvh,30rem)] w-[min(72rem,calc(100vw-2rem))]"
      style={{ left: positionRef.current.x, top: positionRef.current.y }}
    >
      <TerrainProfilePanel {...props} headerDragProps={headerDragProps} />
    </div>
  );

  return createPortal(content, document.body);
}
