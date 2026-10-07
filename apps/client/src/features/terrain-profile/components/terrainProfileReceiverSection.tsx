import { Gps01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useTerrainFormat } from "../format";
import type { TerrainProfilePanelModel } from "../hooks/useTerrainProfileController";
import { RECEIVER_HEIGHT_BOUNDS_METERS, RECEIVER_HEIGHT_PRESETS_METERS, isReceiverHeightAllowed, roundReceiverHeight } from "../receiverRange";
import { TerrainProfileGpsButton, TerrainProfileGpsNotice } from "./terrainProfileGpsButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FacetPill, FilterPanelSection } from "@/features/shared/filterPanel";
import { useGpsFormat } from "@/hooks/usePreferences";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { formatCoordinates } from "@/lib/geo/coordinates";
import { cn } from "@/lib/utils";

type TerrainProfileReceiverSectionProps = {
  panel: TerrainProfilePanelModel;
  onChangePoint: () => void;
};

type ReceiverHeightFieldProps = {
  heightMeters: number;
  onCommit: (heightMeters: number) => void;
};

const HEIGHT_STEP_METERS = 0.1;
const PRESSED_OUTLINE_BUTTON_CLASS = cn(
  "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
  "dark:border-primary/40 dark:bg-primary/15 dark:hover:bg-primary/20",
);

function ReceiverHeightField({ heightMeters, onCommit }: ReceiverHeightFieldProps) {
  const { t } = useTranslation("terrainProfile");
  const [draft, setDraft] = useState(() => String(heightMeters));
  const [syncedHeight, setSyncedHeight] = useState(heightMeters);

  if (heightMeters !== syncedHeight) {
    setSyncedHeight(heightMeters);
    setDraft(String(heightMeters));
  }

  function commitDraft() {
    const nextHeight = roundReceiverHeight(Number(draft));
    if (isReceiverHeightAllowed(nextHeight) && nextHeight !== heightMeters) onCommit(nextHeight);
    else setDraft(String(heightMeters));
  }

  return (
    <label className="relative ml-auto block w-19">
      <Input
        type="number"
        {...NO_AUTOFILL_PROPS}
        min={RECEIVER_HEIGHT_BOUNDS_METERS.min}
        max={RECEIVER_HEIGHT_BOUNDS_METERS.max}
        step={HEIGHT_STEP_METERS}
        value={draft}
        aria-label={t("receiver.height")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key !== "Escape" || event.defaultPrevented || draft === String(heightMeters)) return;
          event.preventDefault();
          setDraft(String(heightMeters));
        }}
        className="h-7 pr-6 font-mono text-xs tabular-nums"
      />
      <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-muted-foreground">
        m
      </span>
    </label>
  );
}

export function TerrainProfileReceiverSection({ panel, onChangePoint }: TerrainProfileReceiverSectionProps) {
  const { t } = useTranslation("terrainProfile");
  const format = useTerrainFormat();
  const gpsFormat = useGpsFormat();
  const { receiverPoint, receiverHeightMeters, isPickingPoint, setReceiverHeight } = panel;

  return (
    <FilterPanelSection title={t("receiver.title")}>
      <div className="flex flex-wrap items-center gap-1.5">
        {RECEIVER_HEIGHT_PRESETS_METERS.map((presetMeters) => (
          <FacetPill
            key={presetMeters}
            active={receiverHeightMeters === presetMeters}
            onClick={() => setReceiverHeight(presetMeters)}
            className="cursor-pointer tabular-nums"
          >
            {`${format.compact(presetMeters, 1)} m`}
          </FacetPill>
        ))}
        <ReceiverHeightField heightMeters={receiverHeightMeters} onCommit={setReceiverHeight} />
      </div>
      {receiverPoint === null ? null : (
        <>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
              {formatCoordinates(receiverPoint.latitude, receiverPoint.longitude, gpsFormat)}
            </span>
            <TerrainProfileGpsButton panel={panel} isIconOnly />
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={isPickingPoint}
              className={cn("cursor-pointer", isPickingPoint ? PRESSED_OUTLINE_BUTTON_CLASS : null)}
              onClick={onChangePoint}
            >
              <HugeiconsIcon icon={Gps01Icon} data-icon="inline-start" aria-hidden="true" />
              {t("receiver.changePoint")}
            </Button>
          </div>
          <TerrainProfileGpsNotice gpsError={panel.gpsError} isReceiverPlaced className="mt-2" />
        </>
      )}
    </FilterPanelSection>
  );
}
