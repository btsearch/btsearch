import { ArrowLeft01Icon, ArrowRight01Icon, ListViewIcon, PauseIcon, PlayIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import type { NsgSnapshot } from "@/lib/nsg/snapshots";
import { cn } from "@/lib/utils";

import { formatTime } from "./display";

type ReplayControlsProps = {
  compact: boolean;
  parsing: boolean;
  playing: boolean;
  playheadMs: number | null;
  snapshots: readonly NsgSnapshot[];
  selectedIndex: number;
  snapshot: NsgSnapshot | null;
  detailsButtonRef: RefObject<HTMLButtonElement | null>;
  onToggle: () => void;
  onSelectEvent: (eventIndex: number) => void;
  onOpenDetails: () => void;
};

export function ReplayControls({
  compact,
  parsing,
  playing,
  playheadMs,
  snapshots,
  selectedIndex,
  snapshot,
  detailsButtonRef,
  onToggle,
  onSelectEvent,
  onOpenDetails,
}: ReplayControlsProps) {
  const { t } = useTranslation(["nsg", "common"]);
  const selectedTime = playheadMs ?? snapshot?.timestampMs ?? null;

  return (
    <>
      <div className={cn("flex items-center gap-2 pt-2", compact ? "px-3" : "px-4")}>
        <Button
          variant="ghost"
          size="icon-xs"
          className={compact ? "size-11" : undefined}
          aria-label={t(playing ? "replay.pause" : "replay.play")}
          title={t(playing ? "replay.pause" : "replay.speed")}
          disabled={snapshots.length < 2 || parsing}
          onClick={onToggle}
        >
          <HugeiconsIcon icon={playing ? PauseIcon : PlayIcon} />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          className={compact ? "size-11" : undefined}
          aria-label={t("common:actions.previous")}
          disabled={selectedIndex === 0 || snapshot === null}
          onClick={() => onSelectEvent(snapshots[selectedIndex - 1].eventIndex)}
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} />
        </Button>
        <span className="min-w-0 flex-1 text-center font-mono text-xs font-semibold tabular-nums" title={formatTime(selectedTime, true)}>
          {formatTime(selectedTime)}
        </span>
        <span className={cn("text-[10px] text-muted-foreground tabular-nums", compact && "hidden")}>
          {snapshot ? selectedIndex + 1 : 0} / {snapshots.length}
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          className={compact ? "size-11" : undefined}
          aria-label={t("common:actions.next")}
          disabled={snapshot === null || selectedIndex + 1 >= snapshots.length}
          onClick={() => onSelectEvent(snapshots[selectedIndex + 1].eventIndex)}
        >
          <HugeiconsIcon icon={ArrowRight01Icon} />
        </Button>
        {compact ? (
          <Button
            ref={detailsButtonRef}
            variant="ghost"
            size="sm"
            className="h-11 shrink-0 px-2 max-[359px]:w-11"
            aria-label={t("mobile.details")}
            onClick={onOpenDetails}
          >
            <HugeiconsIcon icon={ListViewIcon} />
            <span className="max-[359px]:hidden">{t("mobile.detailsButton")}</span>
          </Button>
        ) : null}
      </div>
      <div className={compact ? "px-4 pb-2" : "px-4 py-2"}>
        <span id="nsg-snapshot-slider-label" className="sr-only">
          {t("snapshot.scrub")}
        </span>
        <Slider
          className={compact ? "[&>div]:min-h-11" : undefined}
          min={0}
          max={Math.max(1, snapshots.length - 1)}
          step={1}
          value={[selectedIndex]}
          disabled={snapshots.length < 2}
          onValueChange={(value) => {
            const index = Array.isArray(value) ? value[0] : value;
            const nextSnapshot = snapshots[index];
            if (nextSnapshot) onSelectEvent(nextSnapshot.eventIndex);
          }}
          aria-labelledby="nsg-snapshot-slider-label"
        />
      </div>
    </>
  );
}
