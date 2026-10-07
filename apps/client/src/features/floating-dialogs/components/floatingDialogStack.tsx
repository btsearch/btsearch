import { AnimatePresence, motion, useIsPresent, usePresence, useReducedMotion } from "motion/react";
import { type ReactNode, Suspense, lazy, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { FLOATING_DIALOG_FADE_MOTION, FLOATING_DIALOG_SCALE_MOTION } from "../animation";
import { FLOATING_DIALOG_DESKTOP_MIN_WIDTH, type FloatingDialogRect, type FloatingDialogSize } from "../geometry";
import { assertNever, getStationHistoryTriggerId, getTopDialog } from "../types";
import type { FloatingDialogItem, FloatingDialogPanelFrameProps, StationDialogTarget, StationHistoryFloatingDialogItem } from "../types";
import { FloatingDialogFrame } from "./floatingDialogFrame";
import { ErrorBoundary } from "@/components/app/errorBoundary";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { AntennaDialogFallback } from "@/features/station-details/station/emf/antennas/antennaDialogFallback";
import type { TerrainProfileStationTarget } from "@/features/terrain-profile/types";
import { useIsMobile } from "@/hooks/useMobile";
import { cn } from "@/lib/utils";

const StationDetailsDialogPanel = lazy(() =>
  import("@/features/station-details/components/stationsDetailsDialog").then((module) => ({ default: module.StationDetailsDialogPanel })),
);
const RadioLineDetailsDialogPanel = lazy(() =>
  import("@/features/station-details/components/radioLineDetailsDialog").then((module) => ({ default: module.RadioLineDetailsDialogPanel })),
);
const SI2PEMAntennaDialogPanel = lazy(() =>
  import("@/features/station-details/components/si2pemAntennaDialog").then((module) => ({ default: module.SI2PEMAntennaDialogPanel })),
);
const StationHistoryDialogPanel = lazy(() =>
  import("@/features/station-details/station/history/stationHistoryDialogPanel").then((module) => ({ default: module.StationHistoryDialogPanel })),
);

type FloatingDialogStackProps = {
  dialogs: FloatingDialogItem[];
  onClose: (key: string) => void;
  onFocus: (key: string) => void;
  onRectChange: (key: string, rect: FloatingDialogRect) => void;
  onSwitchStation: (key: string, target: StationDialogTarget) => void;
  onStartTerrainProfile: ((station: TerrainProfileStationTarget) => void) | null;
};

const MOBILE_PANEL_CLASS_NAMES = { className: "pointer-events-auto w-full", contentClassName: "border border-border/70" };
const DESKTOP_PANEL_CLASS_NAMES = { className: "h-full", contentClassName: "h-full max-h-none border border-border/70" };
const TERRAIN_PROFILE_MIN_HEIGHT = 240;
const TERRAIN_PROFILE_MIN_SIZE: FloatingDialogSize = { width: FLOATING_DIALOG_DESKTOP_MIN_WIDTH, height: TERRAIN_PROFILE_MIN_HEIGHT };

type DialogPanelProps = FloatingDialogPanelFrameProps & {
  isMobile: boolean;
  onContentLayoutChange?: () => void;
  onSwitchStation?: (target: StationDialogTarget) => void;
  onStartTerrainProfile: ((station: TerrainProfileStationTarget) => void) | null;
};

type DialogPanelErrorProps = Pick<FloatingDialogPanelFrameProps, "onClose" | "className" | "contentClassName" | "headerDragProps"> & {
  onRetry: () => void;
};

function DialogPanelError({ onClose, onRetry, className, contentClassName, headerDragProps }: DialogPanelErrorProps) {
  const { t } = useTranslation("common");

  return (
    <div className={className}>
      <div
        {...headerDragProps}
        className={cn("w-full rounded-2xl bg-background px-3 py-4 shadow-2xl sm:p-6", contentClassName, headerDragProps?.className)}
      >
        <ErrorState
          className="h-full"
          onRetry={onRetry}
          action={
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("actions.close")}
            </Button>
          }
        />
      </div>
    </div>
  );
}

function renderDialogPanel(dialog: FloatingDialogItem, props: DialogPanelProps): ReactNode {
  return (
    <ErrorBoundary
      resetKey={dialog.key}
      fallback={(reset) => (
        <DialogPanelError
          onClose={props.onClose}
          onRetry={reset}
          className={props.className}
          contentClassName={props.contentClassName}
          headerDragProps={props.headerDragProps}
        />
      )}
    >
      {renderDialogPanelContent(dialog, props)}
    </ErrorBoundary>
  );
}

function renderDialogPanelContent(
  dialog: FloatingDialogItem,
  { isMobile, onContentLayoutChange, onSwitchStation, onStartTerrainProfile, ...frameProps }: DialogPanelProps,
): ReactNode {
  switch (dialog.kind) {
    case "station":
      return (
        <StationDetailsDialogPanel
          {...frameProps}
          stationId={dialog.id}
          locationId={dialog.locationId}
          source={dialog.source}
          ukeStation={dialog.ukeStation}
          switchedFrom={dialog.switchedFrom}
          showPhotoPanel={!isMobile}
          onContentLayoutChange={onContentLayoutChange}
          onSwitchStation={onSwitchStation}
          onStartTerrainProfile={onStartTerrainProfile ?? undefined}
        />
      );
    case "radioline":
      return <RadioLineDetailsDialogPanel {...frameProps} link={dialog.link} />;
    case "si2pem-report":
      return (
        <Suspense fallback={<AntennaDialogFallback {...frameProps} />}>
          <SI2PEMAntennaDialogPanel
            key={dialog.openRequestId}
            {...frameProps}
            site={dialog.site}
            siteId={dialog.siteId}
            report={dialog.report}
            operatorName={dialog.operatorName}
            operatorMnc={dialog.operatorMnc}
            place={dialog.place}
          />
        </Suspense>
      );
    case "station-history":
      return (
        <StationHistoryDialogPanel
          {...frameProps}
          modal={isMobile}
          stationId={dialog.stationId}
          stationCode={dialog.stationCode}
          operatorName={dialog.operatorName}
          operatorBrandId={dialog.operatorBrandId}
        />
      );
    case "terrain-profile":
      return dialog.renderPanel(frameProps);
    default:
      return assertNever(dialog);
  }
}

function isShownOnPhones(dialog: FloatingDialogItem): boolean {
  return dialog.kind !== "terrain-profile";
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
          {renderDialogPanel(dialog, { ...MOBILE_PANEL_CLASS_NAMES, isMobile: true, onClose, onStartTerrainProfile: null })}
        </Suspense>
      </DialogContent>
    </Dialog>
  );
}

type MobileFloatingDialogProps = {
  dialog: FloatingDialogItem;
  onClose: () => void;
  onSwitchStation: (target: StationDialogTarget) => void;
  onStartTerrainProfile: ((station: TerrainProfileStationTarget) => void) | null;
};

function MobileFloatingDialog({ dialog, onClose, onSwitchStation, onStartTerrainProfile }: MobileFloatingDialogProps) {
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
        {renderDialogPanel(dialog, { ...MOBILE_PANEL_CLASS_NAMES, isMobile: true, onClose, onSwitchStation, onStartTerrainProfile })}
      </motion.div>
    </Suspense>
  );
}

export function FloatingDialogStack({ dialogs, onClose, onFocus, onRectChange, onSwitchStation, onStartTerrainProfile }: FloatingDialogStackProps) {
  const isMobile = useIsMobile();
  const topDialog = getTopDialog(isMobile ? dialogs.filter(isShownOnPhones) : dialogs);
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
              key={topDialog.frameId}
              dialog={topDialog}
              onClose={() => onClose(topDialog.key)}
              onSwitchStation={(target) => onSwitchStation(topDialog.key, target)}
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
        <Suspense key={dialog.frameId} fallback={null}>
          <FloatingDialogFrame
            rect={dialog.rect}
            zIndex={dialog.zIndex}
            contentKey={dialog.key}
            fitHeightToContent={dialog.kind !== "station-history"}
            fitAnchor={dialog.kind === "terrain-profile" ? "bottom" : "center"}
            minSize={dialog.kind === "terrain-profile" ? TERRAIN_PROFILE_MIN_SIZE : undefined}
            isCollapsed={dialog.kind === "terrain-profile" && dialog.isCollapsed}
            onFocus={() => onFocus(dialog.key)}
            onRectChange={(rect) => onRectChange(dialog.key, rect)}
          >
            {(frame) =>
              renderDialogPanel(dialog, {
                ...frame,
                ...DESKTOP_PANEL_CLASS_NAMES,
                isMobile: false,
                onClose: () => onClose(dialog.key),
                onSwitchStation: (target) => onSwitchStation(dialog.key, target),
                onStartTerrainProfile,
              })
            }
          </FloatingDialogFrame>
        </Suspense>
      ))}
    </AnimatePresence>,
    document.body,
  );
}
