import { AnimatePresence, motion, useIsPresent, usePresence } from "motion/react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { PROFILE_PART_PROPS, isTextEntryTarget } from "../focus";
import type { TerrainProfilePanelModel } from "../hooks/useTerrainProfileController";
import { TerrainProfileAntennaSection } from "./terrainProfileAntennaSection";
import { TerrainProfileEvidence } from "./terrainProfileEvidence";
import { TerrainProfileFigure } from "./terrainProfileFigure";
import { TerrainProfileReceiverSection } from "./terrainProfileReceiverSection";
import { TerrainProfileStationButton } from "./terrainProfileStationButton";
import { TerrainProfileNotes, TerrainProfileStatus } from "./terrainProfileStatus";
import { CloseButton } from "@/components/ui/close-button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { FLOATING_DIALOG_FADE_MOTION } from "@/features/floating-dialogs/animation";
import { useNavMode } from "@/hooks/usePreferences";
import { getOperatorHeaderTintGradient } from "@/lib/cellular/operators";
import { cn } from "@/lib/utils";

type TerrainProfileSheetProps = {
  panel: TerrainProfilePanelModel | null;
};

type SheetPartProps = {
  panel: TerrainProfilePanelModel;
};

type SheetHandleProps = {
  label: string;
  onClick: () => void;
};

const PEEK_FLOATING_NAV_PADDING_CLASS = "pb-[calc(2.5rem+var(--floating-nav-map-offset,0rem))]";
const PEEK_SAFE_AREA_PADDING_CLASS = "pb-[env(safe-area-inset-bottom)]";
const PEEK_FRAME_CLASS = cn(
  "absolute inset-x-0 bottom-0 z-40 overflow-hidden outline-none",
  "rounded-t-2xl border border-b-0 border-border/70 bg-background text-foreground shadow-2xl",
);
const HANDLE_CLASS = cn(
  "flex h-5 w-full shrink-0 cursor-pointer items-center justify-center",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
);

function SheetHandle({ label, onClick }: SheetHandleProps) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={HANDLE_CLASS}>
      <span aria-hidden="true" className="h-1 w-9 rounded-full bg-muted-foreground/40" />
    </button>
  );
}

function SheetHeading({ panel }: SheetPartProps) {
  const { city } = panel.station;

  return (
    <div className="px-4 pb-2.5">
      <div className="flex items-center gap-2">
        <TerrainProfileStationButton panel={panel} />
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{city}</span>
        <CloseButton onClick={panel.close} className="-mr-2" />
      </div>
      <div className="mt-2">
        <TerrainProfileStatus panel={panel} isCompact />
      </div>
    </div>
  );
}

function SheetPeek({ panel }: SheetPartProps) {
  const { t } = useTranslation("terrainProfile");
  const isPresent = useIsPresent();
  const navMode = useNavMode();
  const peekRef = useRef<HTMLElement>(null);
  const { close, isCollapsed } = panel;

  useEffect(() => {
    if (isPresent) peekRef.current?.focus({ preventScroll: true });
  }, [isPresent]);

  useEffect(() => {
    if (!isPresent || !isCollapsed) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const peek = peekRef.current;
      const isInsidePeek = peek !== null && event.target instanceof Node && peek.contains(event.target);
      if (!isInsidePeek && isTextEntryTarget(event.target)) return;

      event.preventDefault();
      close();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, isCollapsed, isPresent]);

  return (
    <motion.section
      ref={peekRef}
      tabIndex={-1}
      aria-label={t("title")}
      inert={!isPresent}
      className={cn(PEEK_FRAME_CLASS, navMode === "floating" ? PEEK_FLOATING_NAV_PADDING_CLASS : PEEK_SAFE_AREA_PADDING_CLASS)}
      {...PROFILE_PART_PROPS}
      {...FLOATING_DIALOG_FADE_MOTION}
    >
      <div style={{ backgroundImage: getOperatorHeaderTintGradient(panel.brandColor) }}>
        <SheetHandle label={t("header.expand")} onClick={() => panel.setCollapsed(false)} />
        <SheetHeading panel={panel} />
      </div>
    </motion.section>
  );
}

function SheetFull({ panel }: SheetPartProps) {
  const { t } = useTranslation("terrainProfile");
  const [isPresent, safeToRemove] = usePresence();
  const { isCollapsed, mode, profile } = panel;

  useEffect(() => {
    if (!isPresent && isCollapsed) safeToRemove?.();
  }, [isCollapsed, isPresent, safeToRemove]);

  function changePoint() {
    if (!panel.isPickingPoint) panel.setCollapsed(true);
    panel.togglePointPick();
  }

  return (
    <Sheet
      open={isPresent && !isCollapsed}
      onOpenChange={(open) => {
        if (!open) panel.setCollapsed(true);
      }}
      onOpenChangeComplete={(open) => {
        if (!open && !isPresent) safeToRemove?.();
      }}
    >
      <SheetContent side="bottom" showCloseButton={false} className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden rounded-t-2xl p-0">
        <SheetTitle className="sr-only">{t("title")}</SheetTitle>
        <div className="shrink-0" style={{ backgroundImage: getOperatorHeaderTintGradient(panel.brandColor) }}>
          <SheetHandle label={t("header.collapse")} onClick={() => panel.setCollapsed(true)} />
          <SheetHeading panel={panel} />
        </div>
        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain border-t px-4 pt-3 pb-4">
          {profile === null ? null : <TerrainProfileNotes profile={profile} isStale={mode === "calculating"} />}
          <TerrainProfileFigure panel={panel} isCompact />
          <TerrainProfileAntennaSection panel={panel} />
          <TerrainProfileReceiverSection panel={panel} onChangePoint={changePoint} />
          <TerrainProfileEvidence panel={panel} isStacked />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function TerrainProfileSheet({ panel }: TerrainProfileSheetProps) {
  return (
    <>
      <AnimatePresence>{panel === null ? null : <SheetPeek key="peek" panel={panel} />}</AnimatePresence>
      <AnimatePresence>{panel === null ? null : <SheetFull key="full" panel={panel} />}</AnimatePresence>
    </>
  );
}
