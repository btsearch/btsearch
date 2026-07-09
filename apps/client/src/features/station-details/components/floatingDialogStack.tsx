import { type ReactNode, Suspense, lazy } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { useIsMobile } from "@/hooks/useMobile";

import { assertNever } from "./floatingDialogStackTypes";
import type { FloatingDialogItem } from "./floatingDialogStackTypes";
import type { FloatingStationDialogRenderProps } from "./floatingStationDialogFrame";
import { FloatingStationDialogFrame } from "./floatingStationDialogFrame";
import type { StationDialogRect } from "./stationDialogGeometry";

const StationDetailsDialogPanel = lazy(() => import("./stationsDetailsDialog").then((module) => ({ default: module.StationDetailsDialogPanel })));
const UkePermitDetailsDialogPanel = lazy(() =>
  import("./ukePermitDetailsDialog").then((module) => ({ default: module.UkePermitDetailsDialogPanel })),
);
const RadioLineDetailsDialogPanel = lazy(() =>
  import("./radioLineDetailsDialog").then((module) => ({ default: module.RadioLineDetailsDialogPanel })),
);

type FloatingDialogStackProps = {
  dialogs: FloatingDialogItem[];
  onClose: (key: string) => void;
  onFocus: (key: string) => void;
  onRectChange: (key: string, rect: StationDialogRect) => void;
};

function renderMobileDialog(dialog: FloatingDialogItem, onClose: () => void): ReactNode {
  switch (dialog.kind) {
    case "station":
      return (
        <StationDetailsDialogPanel
          stationId={dialog.id}
          source={dialog.source}
          onClose={onClose}
          showPhotoPanel={false}
          className="pointer-events-auto animate-in fade-in zoom-in-95 duration-200 w-full max-w-4xl"
          contentClassName="border border-border/70"
        />
      );
    case "uke-permit":
      return (
        <UkePermitDetailsDialogPanel
          station={dialog.station}
          onClose={onClose}
          className="pointer-events-auto animate-in fade-in zoom-in-95 duration-200 w-full max-w-3xl"
          contentClassName="border border-border/70"
        />
      );
    case "radioline":
      return (
        <RadioLineDetailsDialogPanel
          link={dialog.link}
          onClose={onClose}
          className="pointer-events-auto animate-in fade-in zoom-in-95 duration-200 w-full max-w-3xl"
          contentClassName="border border-border/70"
        />
      );
    default:
      return assertNever(dialog);
  }
}

function renderDesktopDialog(dialog: FloatingDialogItem, frame: FloatingStationDialogRenderProps, onClose: () => void): ReactNode {
  switch (dialog.kind) {
    case "station":
      return (
        <StationDetailsDialogPanel
          stationId={dialog.id}
          source={dialog.source}
          onClose={onClose}
          contentRef={frame.contentRef}
          bodyRef={frame.bodyRef}
          bodyContentRef={frame.bodyContentRef}
          onContentLayoutChange={frame.onContentLayoutChange}
          className="h-full"
          contentClassName="h-full max-h-none border border-border/70"
          headerDragProps={frame.headerDragProps}
        />
      );
    case "uke-permit":
      return (
        <UkePermitDetailsDialogPanel
          station={dialog.station}
          onClose={onClose}
          contentRef={frame.contentRef}
          bodyRef={frame.bodyRef}
          bodyContentRef={frame.bodyContentRef}
          className="h-full"
          contentClassName="h-full max-h-none border border-border/70"
          headerDragProps={frame.headerDragProps}
        />
      );
    case "radioline":
      return (
        <RadioLineDetailsDialogPanel
          link={dialog.link}
          onClose={onClose}
          contentRef={frame.contentRef}
          bodyRef={frame.bodyRef}
          bodyContentRef={frame.bodyContentRef}
          className="h-full"
          contentClassName="h-full max-h-none border border-border/70"
          headerDragProps={frame.headerDragProps}
        />
      );
    default:
      return assertNever(dialog);
  }
}

export function FloatingDialogStack({ dialogs, onClose, onFocus, onRectChange }: FloatingDialogStackProps) {
  const { t } = useTranslation("common");
  const isMobile = useIsMobile();
  const orderedDialogs = dialogs.slice().sort((a, b) => a.zIndex - b.zIndex);

  if (dialogs.length === 0) return null;

  if (isMobile) {
    const topDialog = orderedDialogs[orderedDialogs.length - 1];
    if (topDialog === undefined) return null;

    return createPortal(
      <Suspense fallback={null}>
        <button
          type="button"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm cursor-default"
          onClick={() => onClose(topDialog.key)}
          aria-label={t("actions.close")}
        />
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto pointer-events-none">
          {renderMobileDialog(topDialog, () => onClose(topDialog.key))}
        </div>
      </Suspense>,
      document.body,
    );
  }

  return createPortal(
    <>
      {orderedDialogs.map((dialog) => (
        <Suspense key={dialog.key} fallback={null}>
          <FloatingStationDialogFrame
            rect={dialog.rect}
            zIndex={dialog.zIndex}
            onFocus={() => onFocus(dialog.key)}
            onRectChange={(rect) => onRectChange(dialog.key, rect)}
          >
            {(frame) => renderDesktopDialog(dialog, frame, () => onClose(dialog.key))}
          </FloatingStationDialogFrame>
        </Suspense>
      ))}
    </>,
    document.body,
  );
}
