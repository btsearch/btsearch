import {
  type HTMLAttributes,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { useTranslation } from "react-i18next";

import {
  STATION_DIALOG_DESKTOP_MIN_WIDTH,
  type StationDialogInteractionMode,
  type StationDialogRect,
  applyStationDialogRect,
  clampStationDialogRect,
  getNaturalStationDialogHeight,
  getStationDialogCursor,
  getStationDialogInteractionRect,
  getStationDialogPosition,
  shouldSyncStationDialogRect,
} from "./stationDialogGeometry";

export type FloatingStationDialogRenderProps = {
  contentRef: Ref<HTMLDivElement>;
  bodyRef: Ref<HTMLDivElement>;
  bodyContentRef: Ref<HTMLDivElement>;
  onContentLayoutChange: () => void;
  headerDragProps: HTMLAttributes<HTMLDivElement>;
};

type FloatingStationDialogFrameProps = {
  rect: StationDialogRect;
  zIndex: number;
  fitHeightToContent?: boolean;
  onFocus: () => void;
  onRectChange: (rect: StationDialogRect) => void;
  children: (props: FloatingStationDialogRenderProps) => ReactNode;
};

type InteractionState = {
  pointerId: number;
  mode: StationDialogInteractionMode;
  startX: number;
  startY: number;
  startRect: StationDialogRect;
  nextRect: StationDialogRect;
  frameId: number | null;
};

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return target.closest("button,a,input,textarea,select,[role='button']") !== null;
}

export function FloatingStationDialogFrame({
  rect,
  zIndex,
  fitHeightToContent = true,
  onFocus,
  onRectChange,
  children,
}: FloatingStationDialogFrameProps) {
  const { t } = useTranslation("common");
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyContentRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<InteractionState | null>(null);
  const userResizedHeightRef = useRef(false);
  const dialogRectRef = useRef(rect);
  const onRectChangeRef = useRef(onRectChange);

  useLayoutEffect(() => {
    dialogRectRef.current = rect;
    onRectChangeRef.current = onRectChange;
    const nextRect = clampStationDialogRect(rect);
    applyStationDialogRect(panelRef.current, nextRect);
    if (shouldSyncStationDialogRect(rect, nextRect)) {
      dialogRectRef.current = nextRect;
      onRectChangeRef.current(nextRect);
    }
  }, [onRectChange, rect]);

  useEffect(
    () => () => {
      const interaction = interactionRef.current;
      if (interaction !== null && interaction.frameId !== null) cancelAnimationFrame(interaction.frameId);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    },
    [],
  );

  const fitDialogToContent = useCallback(() => {
    if (!fitHeightToContent || userResizedHeightRef.current || interactionRef.current !== null) return;

    const content = contentRef.current;
    const body = bodyRef.current;
    const bodyContent = bodyContentRef.current;
    if (content === null || body === null || bodyContent === null) return;

    const currentRect = dialogRectRef.current;
    const naturalHeight = getNaturalStationDialogHeight(content, body, bodyContent);
    const targetHeight = clampStationDialogRect({ ...currentRect, height: naturalHeight }).height;
    const nextRect = clampStationDialogRect({
      ...currentRect,
      y: currentRect.y + (currentRect.height - targetHeight) / 2,
      height: targetHeight,
    });

    if (!shouldSyncStationDialogRect(currentRect, nextRect)) return;
    dialogRectRef.current = nextRect;
    applyStationDialogRect(panelRef.current, nextRect);
    onRectChangeRef.current(nextRect);
  }, [fitHeightToContent]);

  useLayoutEffect(() => {
    if (!fitHeightToContent) return;

    const bodyContent = bodyContentRef.current;
    if (bodyContent === null) return;

    let frameId: number | null = null;
    const scheduleFit = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = null;
        fitDialogToContent();
      });
    };

    fitDialogToContent();

    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(bodyContent);

    return () => {
      resizeObserver.disconnect();
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [fitDialogToContent, fitHeightToContent]);

  const beginInteraction = useCallback(
    (event: ReactPointerEvent<HTMLElement>, mode: StationDialogInteractionMode) => {
      if (mode === "drag" && isInteractiveTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      onFocus();
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.style.userSelect = "none";
      document.body.style.cursor = getStationDialogCursor(mode);
      if (mode === "resize-corner") userResizedHeightRef.current = true;
      const startRect = clampStationDialogRect(dialogRectRef.current);
      interactionRef.current = {
        pointerId: event.pointerId,
        mode,
        startX: event.clientX,
        startY: event.clientY,
        startRect,
        nextRect: startRect,
        frameId: null,
      };
    },
    [onFocus],
  );

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (interaction === null || interaction.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();

    const deltaX = event.clientX - interaction.startX;
    const deltaY = event.clientY - interaction.startY;
    const nextRect = getStationDialogInteractionRect(interaction.mode, interaction.startRect, deltaX, deltaY);

    interaction.nextRect = nextRect;
    if (interaction.frameId === null) {
      interaction.frameId = requestAnimationFrame(() => {
        interaction.frameId = null;
        applyStationDialogRect(panelRef.current, interaction.nextRect);
      });
    }
  }, []);

  const endInteraction = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const interaction = interactionRef.current;
    if (interaction === null || interaction.pointerId !== event.pointerId) return;

    const nextRect = interaction.nextRect;
    event.preventDefault();
    event.stopPropagation();
    if (interaction.frameId !== null) cancelAnimationFrame(interaction.frameId);
    interactionRef.current = null;
    document.body.style.userSelect = "";
    document.body.style.cursor = "";
    dialogRectRef.current = nextRect;
    applyStationDialogRect(panelRef.current, nextRect);
    onRectChangeRef.current(nextRect);
  }, []);

  return (
    <div
      ref={panelRef}
      className="fixed pointer-events-auto animate-in fade-in duration-100"
      style={{
        ...getStationDialogPosition(rect),
        minWidth: STATION_DIALOG_DESKTOP_MIN_WIDTH,
        zIndex,
      }}
      onPointerDown={onFocus}
      onFocusCapture={onFocus}
    >
      {children({
        contentRef,
        bodyRef,
        bodyContentRef,
        onContentLayoutChange: fitDialogToContent,
        headerDragProps: {
          className: "cursor-grab active:cursor-grabbing select-none touch-none",
          onPointerDown: (event) => beginInteraction(event, "drag"),
          onPointerMove: handlePointerMove,
          onPointerUp: endInteraction,
          onPointerCancel: endInteraction,
        },
      })}
      <button
        type="button"
        aria-label={t("actions.resizeHorizontally")}
        className="absolute -right-1 top-8 bottom-8 w-3 border-0 bg-transparent p-0 pointer-events-auto cursor-ew-resize touch-none opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 after:absolute after:right-1 after:top-1/2 after:h-16 after:w-1 after:-translate-y-1/2 after:rounded-full after:bg-muted-foreground/40"
        onPointerDown={(event) => beginInteraction(event, "resize-horizontal")}
        onPointerMove={handlePointerMove}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
      />
      <button
        type="button"
        aria-label={t("actions.resize")}
        className="absolute bottom-1 right-1 pointer-events-auto size-5 rounded-br-2xl cursor-nwse-resize touch-none opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 before:absolute before:right-1 before:bottom-1 before:h-2.5 before:w-2.5 before:border-r before:border-b before:border-muted-foreground"
        onPointerDown={(event) => beginInteraction(event, "resize-corner")}
        onPointerMove={handlePointerMove}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
      />
    </div>
  );
}
