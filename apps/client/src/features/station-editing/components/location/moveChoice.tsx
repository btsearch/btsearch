import { AirportTowerIcon, Location01Icon, Move01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import type { LocationMove } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import { Reveal } from "@/features/map/components/search-overlay/mapFilterMotion";
import { cn } from "@/lib/utils";

type MoveChoiceProps = {
  isShown: boolean;
  move: LocationMove;
  distance: string;
  consequence: string;
  error?: string;
  isDisabled: boolean;
  onMoveChange: (move: LocationMove) => void;
};

type MoveOptionProps = {
  icon: IconSvgElement;
  label: string;
  isChosen: boolean;
  isDisabled: boolean;
  onChoose: () => void;
};

const OPTION_CLASS = cn(
  "flex h-7 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md px-2 text-xs font-medium transition-colors",
  "focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed",
);
const CHOSEN_OPTION_CLASS = "bg-background text-foreground shadow-sm ring-1 ring-foreground/50";
const OTHER_OPTION_CLASS = "text-muted-foreground hover:bg-background/50 hover:text-foreground";

function MoveOption({ icon, label, isChosen, isDisabled, onChoose }: MoveOptionProps) {
  return (
    <button
      type="button"
      aria-pressed={isChosen}
      disabled={isDisabled}
      onClick={onChoose}
      className={cn(OPTION_CLASS, isChosen ? CHOSEN_OPTION_CLASS : OTHER_OPTION_CLASS)}
    >
      <HugeiconsIcon icon={icon} aria-hidden="true" className="size-3.5" />
      {label}
    </button>
  );
}

export function MoveChoice({ isShown, move, distance, consequence, error, isDisabled, onMoveChange }: MoveChoiceProps) {
  const { t } = useTranslation();

  return (
    <Reveal shown={isShown} className="pt-4">
      <div className="flex flex-col gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/6 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 items-center gap-1.5 text-xs">
            <HugeiconsIcon icon={Move01Icon} aria-hidden="true" className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="font-medium">{t("stations:edit.location.movedTitle", { distance })}</span>
            <span className="text-muted-foreground">· {t("stations:edit.location.moveQuestion")}</span>
          </div>
          <div
            role="group"
            aria-label={t("stations:edit.location.moveLabel")}
            className="flex shrink-0 items-center rounded-lg border bg-card p-0.5 shadow-sm"
          >
            <MoveOption
              icon={AirportTowerIcon}
              label={t("stations:edit.location.moveStation")}
              isChosen={move === "station"}
              isDisabled={isDisabled}
              onChoose={() => onMoveChange("station")}
            />
            <MoveOption
              icon={Location01Icon}
              label={t("stations:edit.location.moveLocation")}
              isChosen={move === "location"}
              isDisabled={isDisabled}
              onChoose={() => onMoveChange("location")}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{consequence}</p>
        {error === undefined ? null : <p className="text-xs text-destructive">{error}</p>}
      </div>
    </Reveal>
  );
}
