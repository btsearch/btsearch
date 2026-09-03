import { type ReactNode, Suspense, lazy, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { TerrainProfileStationTarget } from "@/features/terrain-profile/types";
import { useIsMobile } from "@/hooks/useMobile";

import { assertNever, getStationHistoryTriggerId } from "./floatingDialogStackTypes";
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
const SI2PEMAntennaDialogPanel = lazy(() => import("./si2pemAntennaDialog").then((module) => ({ default: module.SI2PEMAntennaDialogPanel })));
const StationHistoryDialogPanel = lazy(() => import("./stationHistoryDialog").then((module) => ({ default: module.StationHistoryDialogPanel })));

type FloatingDialogStackProps = {
  dialogs: FloatingDialogItem[];
  onClose: (key: string) => void;
  onFocus: (key: string) => void;
  onRectChange: (key: string, rect: StationDialogRect) => void;
  onStartTerrainProfile: ((station: TerrainProfileStationTarget) => void) | null;
};

function renderMobileDialog(
  dialog: FloatingDialogItem,
  onClose: () => void,
  onStartTerrainProfile: ((station: TerrainProfileStationTarget) => void) | null,
): ReactNode {
  switch (dialog.kind) {
    case "station":
      return (
        <StationDetailsDialogPanel
          stationId={dialog.id}
          source={dialog.source}
          onClose={onClose}
          onStartTerrainProfile={onStartTerrainProfile ?? undefined}
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
    case "si2pem-report":
      return (
        <SI2PEMAntennaDialogPanel
          report={dialog.report}
          latitude={dialog.latitude}
          longitude={dialog.longitude}
          operatorName={dialog.operatorName}
          operatorMnc={dialog.operatorMnc}
          onClose={onClose}
          className="pointer-events-auto animate-in fade-in zoom-in-95 duration-200 w-full max-w-5xl"
          contentClassName="border border-border/70"
        />
      );
    case "station-history":
      return (
        <StationHistoryDialogPanel
          stationId={dialog.stationId}
          stationCode={dialog.stationCode}
          operatorName={dialog.operatorName}
          operatorMnc={dialog.operatorMnc}
          modal
          onClose={onClose}
          className="pointer-events-auto animate-in fade-in zoom-in-95 duration-200 w-full max-w-none"
          contentClassName="border border-border/70"
        />
      );
    default:
      return assertNever(dialog);
  }
}

function renderDesktopDialog(
  dialog: FloatingDialogItem,
  frame: FloatingStationDialogRenderProps,
  onClose: () => void,
  onStartTerrainProfile: ((station: TerrainProfileStationTarget) => void) | null,
): ReactNode {
  switch (dialog.kind) {
    case "station":
      return (
        <StationDetailsDialogPanel
          stationId={dialog.id}
          source={dialog.source}
          onClose={onClose}
          onStartTerrainProfile={onStartTerrainProfile ?? undefined}
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
    case "si2pem-report":
      return (
        <SI2PEMAntennaDialogPanel
          report={dialog.report}
          latitude={dialog.latitude}
          longitude={dialog.longitude}
          operatorName={dialog.operatorName}
          operatorMnc={dialog.operatorMnc}
          onClose={onClose}
          contentRef={frame.contentRef}
          bodyRef={frame.bodyRef}
          bodyContentRef={frame.bodyContentRef}
          className="h-full"
          contentClassName="h-full max-h-none border border-border/70"
          headerDragProps={frame.headerDragProps}
        />
      );
    case "station-history":
      return (
        <StationHistoryDialogPanel
          stationId={dialog.stationId}
          stationCode={dialog.stationCode}
          operatorName={dialog.operatorName}
          operatorMnc={dialog.operatorMnc}
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

export function FloatingDialogStack({ dialogs, onClose, onFocus, onRectChange, onStartTerrainProfile }: FloatingDialogStackProps) {
  const { t } = useTranslation(["common", "stationDetails"]);
  const isMobile = useIsMobile();
  const orderedDialogs = dialogs.slice().sort((a, b) => a.zIndex - b.zIndex);
  const topDialog = orderedDialogs[orderedDialogs.length - 1];
  const previousTopDialogRef = useRef<FloatingDialogItem | undefined>(undefined);

  useEffect(() => {
    const previousTopDialog = previousTopDialogRef.current;
    previousTopDialogRef.current = topDialog;
    if (!isMobile || previousTopDialog?.kind !== "station-history" || topDialog?.kind !== "station" || previousTopDialog.stationId !== topDialog.id)
      return;

    const frameId = requestAnimationFrame(() => document.getElementById(getStationHistoryTriggerId(topDialog.id))?.focus());
    return () => cancelAnimationFrame(frameId);
  }, [isMobile, topDialog]);

  if (dialogs.length === 0) return null;

  if (isMobile) {
    if (topDialog === undefined) return null;

    if (topDialog.kind === "station-history") {
      return (
        <Dialog open modal onOpenChange={(open) => !open && onClose(topDialog.key)}>
          <DialogContent
            showCloseButton={false}
            overlayClassName="bg-black/50 backdrop-blur-sm"
            className="pointer-events-none fixed inset-0 flex h-dvh w-full max-w-none translate-x-0 translate-y-0 items-start justify-center gap-0 overflow-y-auto rounded-none bg-transparent p-4 ring-0 sm:max-w-none"
          >
            <DialogTitle render={<span className="sr-only" />}>{t("stationDetails:history.title")}</DialogTitle>
            <Suspense
              fallback={
                <div className="pointer-events-auto w-full max-w-none overflow-hidden rounded-2xl border border-border/70 bg-background shadow-2xl">
                  <div className="space-y-2 border-b px-4 py-3">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <output className="block space-y-3 p-4" aria-label={t("common:actions.loading")}>
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                    <Skeleton className="h-20 w-full" />
                  </output>
                </div>
              }
            >
              {renderMobileDialog(topDialog, () => onClose(topDialog.key), onStartTerrainProfile)}
            </Suspense>
          </DialogContent>
        </Dialog>
      );
    }

    return createPortal(
      <Suspense fallback={null}>
        <button
          type="button"
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm cursor-default"
          onClick={() => onClose(topDialog.key)}
          aria-label={t("common:actions.close")}
        />
        <div className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto pointer-events-none">
          {renderMobileDialog(topDialog, () => onClose(topDialog.key), onStartTerrainProfile)}
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
            fitHeightToContent={dialog.kind !== "si2pem-report" && dialog.kind !== "station-history"}
            onFocus={() => onFocus(dialog.key)}
            onRectChange={(rect) => onRectChange(dialog.key, rect)}
          >
            {(frame) => renderDesktopDialog(dialog, frame, () => onClose(dialog.key), onStartTerrainProfile)}
          </FloatingStationDialogFrame>
        </Suspense>
      ))}
    </>,
    document.body,
  );
}
