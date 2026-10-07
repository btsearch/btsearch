import { motion, useIsPresent, useReducedMotion } from "motion/react";
import {
  type HTMLAttributes,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

import { FLOATING_DIALOG_FADE_MOTION, FLOATING_DIALOG_SCALE_MOTION } from "../animation";
import {
  FLOATING_DIALOG_DESKTOP_MIN_SIZE,
  type FloatingDialogFitAnchor,
  type FloatingDialogInteractionMode,
  type FloatingDialogRect,
  type FloatingDialogSize,
  applyFloatingDialogRect,
  clampFloatingDialogRect,
  getCollapsedFloatingDialogHeight,
  getFittedFloatingDialogY,
  getFloatingDialogCursor,
  getFloatingDialogInteractionRect,
  getFloatingDialogPosition,
  getNaturalFloatingDialogHeight,
  shouldSyncFloatingDialogRect,
} from "../geometry";

export type FloatingDialogRenderProps = {
  contentRef: Ref<HTMLDivElement>;
  bodyRef: Ref<HTMLDivElement>;
  bodyContentRef: Ref<HTMLDivElement>;
  onContentLayoutChange: () => void;
  headerDragProps: HTMLAttributes<HTMLDivElement>;
};

type FloatingDialogFrameProps = {
  rect: FloatingDialogRect;
  zIndex: number;
  contentKey?: string;
  fitHeightToContent?: boolean;
  fitAnchor?: FloatingDialogFitAnchor;
  minSize?: FloatingDialogSize;
  isCollapsed?: boolean;
  onFocus: () => void;
  onRectChange: (rect: FloatingDialogRect) => void;
  children: (props: FloatingDialogRenderProps) => ReactNode;
};

type InteractionState = {
  pointerId: number;
  mode: FloatingDialogInteractionMode;
  startX: number;
  startY: number;
  startRect: FloatingDialogRect;
  nextRect: FloatingDialogRect;
  sizeLimit: FloatingDialogSize;
  frameId: number | null;
};

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return target.closest("button,a,input,textarea,select,[role='button']") !== null;
}

function getSizeLimit(minSize: FloatingDialogSize, isCollapsed: boolean): FloatingDialogSize {
  return isCollapsed ? { width: minSize.width, height: 0 } : minSize;
}

export function FloatingDialogFrame({
  rect,
  zIndex,
  contentKey,
  fitHeightToContent = true,
  fitAnchor = "center",
  minSize = FLOATING_DIALOG_DESKTOP_MIN_SIZE,
  isCollapsed = false,
  onFocus,
  onRectChange,
  children,
}: FloatingDialogFrameProps) {
  const { t } = useTranslation("common");
  const isPresent = useIsPresent();
  const reduceMotion = useReducedMotion() === true;
  const [isHeightManual, setIsHeightManual] = useState(false);
  const [bodyContentElement, setBodyContentElement] = useState<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyContentRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<InteractionState | null>(null);
  const userResizedHeightRef = useRef(false);
  const expandedHeightRef = useRef<number | null>(null);
  const minSizeRef = useRef(minSize);
  const dialogRectRef = useRef(rect);
  const onRectChangeRef = useRef(onRectChange);

  useLayoutEffect(() => {
    dialogRectRef.current = rect;
    onRectChangeRef.current = onRectChange;
    minSizeRef.current = minSize;
    const nextRect = clampFloatingDialogRect(rect, getSizeLimit(minSize, expandedHeightRef.current !== null));
    applyFloatingDialogRect(panelRef.current, nextRect);
    if (shouldSyncFloatingDialogRect(rect, nextRect)) {
      dialogRectRef.current = nextRect;
      onRectChangeRef.current(nextRect);
    }
  }, [minSize, onRectChange, rect]);

  useEffect(
    () => () => {
      const interaction = interactionRef.current;
      if (interaction !== null && interaction.frameId !== null) cancelAnimationFrame(interaction.frameId);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    },
    [],
  );

  const attachBodyContent = useCallback((element: HTMLDivElement | null) => {
    bodyContentRef.current = element;
    setBodyContentElement(element);
  }, []);

  const fitDialogToContent = useCallback(() => {
    if (!fitHeightToContent || userResizedHeightRef.current || interactionRef.current !== null || expandedHeightRef.current !== null) return;

    const content = contentRef.current;
    const body = bodyRef.current;
    const bodyContent = bodyContentRef.current;
    if (content === null || body === null || bodyContent === null) return;

    const currentRect = dialogRectRef.current;
    const sizeLimit = minSizeRef.current;
    const naturalHeight = getNaturalFloatingDialogHeight(content, body, bodyContent);
    const targetHeight = clampFloatingDialogRect({ ...currentRect, height: naturalHeight }, sizeLimit).height;
    const nextRect = clampFloatingDialogRect(
      { ...currentRect, y: getFittedFloatingDialogY(currentRect, targetHeight, fitAnchor), height: targetHeight },
      sizeLimit,
    );

    if (!shouldSyncFloatingDialogRect(currentRect, nextRect)) return;
    dialogRectRef.current = nextRect;
    applyFloatingDialogRect(panelRef.current, nextRect);
    onRectChangeRef.current(nextRect);
  }, [fitAnchor, fitHeightToContent]);

  useLayoutEffect(() => {
    if (!fitHeightToContent) return;

    fitDialogToContent();
    if (bodyContentElement === null) return;

    let frameId: number | null = null;
    const scheduleFit = () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        frameId = null;
        fitDialogToContent();
      });
    };

    const resizeObserver = new ResizeObserver(scheduleFit);
    resizeObserver.observe(bodyContentElement);

    return () => {
      resizeObserver.disconnect();
      if (frameId !== null) cancelAnimationFrame(frameId);
    };
  }, [bodyContentElement, contentKey, fitDialogToContent, fitHeightToContent]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    const body = bodyRef.current;
    const bodyContent = bodyContentRef.current;
    const expandedHeight = expandedHeightRef.current;
    if (isCollapsed === (expandedHeight !== null) || content === null || body === null) return;

    const currentRect = dialogRectRef.current;
    let height = expandedHeight ?? getCollapsedFloatingDialogHeight(content, body);
    if (expandedHeight !== null && fitHeightToContent && !userResizedHeightRef.current && bodyContent !== null) {
      height = getNaturalFloatingDialogHeight(content, body, bodyContent);
    }

    expandedHeightRef.current = isCollapsed ? currentRect.height : null;
    const y = fitAnchor === "bottom" ? currentRect.y + currentRect.height - height : currentRect.y;
    const nextRect = clampFloatingDialogRect({ ...currentRect, y, height }, getSizeLimit(minSizeRef.current, isCollapsed));
    dialogRectRef.current = nextRect;
    applyFloatingDialogRect(panelRef.current, nextRect);
    onRectChangeRef.current(nextRect);
  }, [fitAnchor, fitHeightToContent, isCollapsed]);

  const beginInteraction = useCallback(
    (event: ReactPointerEvent<HTMLElement>, mode: FloatingDialogInteractionMode) => {
      if (mode === "drag" && isInteractiveTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      onFocus();
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.style.userSelect = "none";
      document.body.style.cursor = getFloatingDialogCursor(mode);
      if (mode === "resize-corner") {
        userResizedHeightRef.current = true;
        setIsHeightManual(true);
      }
      const sizeLimit = getSizeLimit(minSizeRef.current, expandedHeightRef.current !== null);
      const startRect = clampFloatingDialogRect(dialogRectRef.current, sizeLimit);
      interactionRef.current = {
        pointerId: event.pointerId,
        mode,
        startX: event.clientX,
        startY: event.clientY,
        startRect,
        nextRect: startRect,
        sizeLimit,
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
    const nextRect = getFloatingDialogInteractionRect(interaction.mode, interaction.startRect, deltaX, deltaY, interaction.sizeLimit);

    interaction.nextRect = nextRect;
    if (interaction.frameId === null) {
      interaction.frameId = requestAnimationFrame(() => {
        interaction.frameId = null;
        applyFloatingDialogRect(panelRef.current, interaction.nextRect);
      });
    }
  }, []);

  const endInteraction = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
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
      applyFloatingDialogRect(panelRef.current, nextRect);
      onRectChangeRef.current(nextRect);
      if (interaction.mode === "resize-horizontal") fitDialogToContent();
    },
    [fitDialogToContent],
  );

  return (
    <motion.div
      ref={panelRef}
      className="fixed pointer-events-auto transition-[left,top,width,height] duration-100 ease-[ease] motion-reduce:transition-none"
      style={{
        ...getFloatingDialogPosition(rect),
        minWidth: minSize.width,
        zIndex,
      }}
      inert={!isPresent}
      data-floating-dialog-key={contentKey}
      data-height-mode={isHeightManual ? "manual" : "auto"}
      onPointerDown={onFocus}
      {...(reduceMotion ? FLOATING_DIALOG_FADE_MOTION : FLOATING_DIALOG_SCALE_MOTION)}
    >
      {children({
        contentRef,
        bodyRef,
        bodyContentRef: attachBodyContent,
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
      {isCollapsed ? null : (
        <button
          type="button"
          aria-label={t("actions.resize")}
          className="absolute bottom-1 right-1 pointer-events-auto size-5 rounded-br-2xl cursor-nwse-resize touch-none opacity-0 transition-opacity hover:opacity-100 focus-visible:opacity-100 before:absolute before:right-1 before:bottom-1 before:h-2.5 before:w-2.5 before:border-r before:border-b before:border-muted-foreground"
          onPointerDown={(event) => beginInteraction(event, "resize-corner")}
          onPointerMove={handlePointerMove}
          onPointerUp={endInteraction}
          onPointerCancel={endInteraction}
        />
      )}
    </motion.div>
  );
}
