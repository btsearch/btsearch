import { AnimatePresence, motion, useIsPresent, usePresence, useReducedMotion } from "motion/react";
import { type ReactNode, Suspense, lazy, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { FLOATING_DIALOG_FADE_MOTION, FLOATING_DIALOG_SCALE_MOTION } from "../animation";
import type { FloatingDialogRect } from "../geometry";
import { assertNever, getStationHistoryTriggerId, getTopDialog } from "../types";
import type { FloatingDialogItem, StationHistoryFloatingDialogItem } from "../types";
import type { FloatingDialogRenderProps } from "./floatingDialogFrame";
import { FloatingDialogFrame } from "./floatingDialogFrame";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { TerrainProfileStationTarget } from "@/features/terrain-profile/types";
import { useIsMobile } from "@/hooks/useMobile";

const StationDetailsDialogPanel = lazy(() =>
  import("@/features/station-details/components/stationsDetailsDialog").then((module) => ({ default: module.StationDetailsDialogPanel })),
);
const UkePermitDetailsDialogPanel = lazy(() =>
  import("@/features/station-details/components/ukePermitDetailsDialog").then((module) => ({ default: module.UkePermitDetailsDialogPanel })),
);
const RadioLineDetailsDialogPanel = lazy(() =>
  import("@/features/station-details/components/radioLineDetailsDialog").then((module) => ({ default: module.RadioLineDetailsDialogPanel })),
);
const SI2PEMAntennaDialogPanel = lazy(() =>
  import("@/features/station-details/components/si2pemAntennaDialog").then((module) => ({ default: module.SI2PEMAntennaDialogPanel })),
);
const StationHistoryDialogPanel = lazy(() =>
  import("@/features/station-details/components/stationHistoryDialog").then((module) => ({ default: module.StationHistoryDialogPanel })),
);

type FloatingDialogStackProps = {
  dialogs: FloatingDialogItem[];
  onClose: (key: string) => void;
  onFocus: (key: string) => void;
  onRectChange: (key: string, rect: FloatingDialogRect) => void;
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
          className="pointer-events-auto w-full max-w-4xl"
          contentClassName="border border-border/70"
        />
      );
    case "uke-permit":
      return (
        <UkePermitDetailsDialogPanel
          station={dialog.station}
          onClose={onClose}
          className="pointer-events-auto w-full max-w-3xl"
          contentClassName="border border-border/70"
        />
      );
    case "radioline":
      return (
        <RadioLineDetailsDialogPanel
          link={dialog.link}
          onClose={onClose}
          className="pointer-events-auto w-full max-w-3xl"
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
          className="pointer-events-auto w-full max-w-5xl"
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
          className="pointer-events-auto w-full max-w-none"
          contentClassName="border border-border/70"
        />
      );
    default:
      return assertNever(dialog);
  }
}

function renderDesktopDialog(
  dialog: FloatingDialogItem,
  frame: FloatingDialogRenderProps,
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

function MobileDialogBackdrop({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("common");

  return (
    <motion.button
      type="button"
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm cursor-default"
      onClick={onClose}
      aria-label={t("actions.close")}
      {...FLOATING_DIALOG_FADE_MOTION}
    />
  );
}

function MobileStationHistoryDialog({ dialog, onClose }: { dialog: StationHistoryFloatingDialogItem; onClose: () => void }) {
  const { t } = useTranslation(["common", "stationDetails"]);
  const [isPresent, safeToRemove] = usePresence();

  return (
    <Dialog open={isPresent} modal onOpenChange={(open) => !open && onClose()} onOpenChangeComplete={(open) => !open && safeToRemove?.()}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="bg-transparent backdrop-blur-none"
        finalFocus={() => document.getElementById(getStationHistoryTriggerId(dialog.stationId)) ?? true}
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
          {renderMobileDialog(dialog, onClose, null)}
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

type MobileFloatingDialogProps = {
  dialog: FloatingDialogItem;
  onClose: () => void;
  onStartTerrainProfile: ((station: TerrainProfileStationTarget) => void) | null;
};

function MobileFloatingDialog({ dialog, onClose, onStartTerrainProfile }: MobileFloatingDialogProps) {
  const isPresent = useIsPresent();
  const reduceMotion = useReducedMotion() === true;

  if (dialog.kind === "station-history") return <MobileStationHistoryDialog dialog={dialog} onClose={onClose} />;

  return (
    <Suspense fallback={null}>
      <motion.div
        inert={!isPresent}
        className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto pointer-events-none"
        {...(reduceMotion ? FLOATING_DIALOG_FADE_MOTION : FLOATING_DIALOG_SCALE_MOTION)}
      >
        {renderMobileDialog(dialog, onClose, onStartTerrainProfile)}
      </motion.div>
    </Suspense>
  );
}

export function FloatingDialogStack({ dialogs, onClose, onFocus, onRectChange, onStartTerrainProfile }: FloatingDialogStackProps) {
  const isMobile = useIsMobile();
  const topDialog = getTopDialog(dialogs);
  const previousTopDialogRef = useRef<FloatingDialogItem | undefined>(undefined);

  useEffect(() => {
    const previousTopDialog = previousTopDialogRef.current;
    previousTopDialogRef.current = topDialog;
    if (!isMobile || previousTopDialog?.kind !== "station-history" || topDialog?.kind !== "station" || previousTopDialog.stationId !== topDialog.id)
      return;

    const frameId = requestAnimationFrame(() => document.getElementById(getStationHistoryTriggerId(topDialog.id))?.focus());
    return () => cancelAnimationFrame(frameId);
  }, [isMobile, topDialog]);

  if (isMobile) {
    return createPortal(
      <>
        <AnimatePresence>
          {topDialog === undefined ? null : <MobileDialogBackdrop key="backdrop" onClose={() => onClose(topDialog.key)} />}
        </AnimatePresence>
        <AnimatePresence>
          {topDialog === undefined ? null : (
            <MobileFloatingDialog
              key={topDialog.key}
              dialog={topDialog}
              onClose={() => onClose(topDialog.key)}
              onStartTerrainProfile={onStartTerrainProfile}
            />
          )}
        </AnimatePresence>
      </>,
      document.body,
    );
  }

  return createPortal(
    <AnimatePresence>
      {dialogs.map((dialog) => (
        <Suspense key={dialog.key} fallback={null}>
          <FloatingDialogFrame
            rect={dialog.rect}
            zIndex={dialog.zIndex}
            fitHeightToContent={dialog.kind !== "si2pem-report" && dialog.kind !== "station-history"}
            onFocus={() => onFocus(dialog.key)}
            onRectChange={(rect) => onRectChange(dialog.key, rect)}
          >
            {(frame) => renderDesktopDialog(dialog, frame, () => onClose(dialog.key), onStartTerrainProfile)}
          </FloatingDialogFrame>
        </Suspense>
      ))}
    </AnimatePresence>,
    document.body,
  );
}
