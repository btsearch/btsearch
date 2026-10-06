import { Database02Icon, File02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/utils";
import type { StationSource } from "@/types/station";

export const SOURCE_SWITCH_SLIDE_MS = 200;

const SOURCE_OPTIONS = [
  {
    source: "internal",
    labelKey: "dialog.sourceDatabase",
    icon: Database02Icon,
    indicatorClassName: "translate-x-0 bg-emerald-700",
    hoverClassName: "hover:text-emerald-700 dark:hover:text-emerald-400",
  },
  {
    source: "uke",
    labelKey: "dialog.sourceUke",
    icon: File02Icon,
    indicatorClassName: "translate-x-full bg-violet-600",
    hoverClassName: "hover:text-violet-600 dark:hover:text-violet-400",
  },
] as const;

type SourceSwitchProps = {
  source: StationSource;
  onSourceChange: (source: StationSource) => void;
  onSwitchIntent?: () => void;
  alwaysLabeled?: boolean;
  keepsFocusInPlace?: boolean;
};

function preventFocusOnPress(event: MouseEvent) {
  event.preventDefault();
}

export function SourceSwitch({ source, onSourceChange, onSwitchIntent, alwaysLabeled = false, keepsFocusInPlace = false }: SourceSwitchProps) {
  const { t } = useTranslation(["stationDetails", "main"]);
  const selectedOption = SOURCE_OPTIONS.find((option) => option.source === source) ?? SOURCE_OPTIONS[0];

  return (
    <div
      role="group"
      aria-label={t("main:filters.dataSource")}
      className="relative grid shrink-0 grid-cols-2 rounded-lg bg-background/60 p-0.5 ring-1 ring-inset ring-border/70"
    >
      <span
        aria-hidden="true"
        style={{ transitionDuration: `${SOURCE_SWITCH_SLIDE_MS}ms` }}
        className={cn(
          "pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md shadow-sm transition-[translate,background-color] ease-out motion-reduce:transition-none",
          selectedOption.indicatorClassName,
        )}
      />
      {SOURCE_OPTIONS.map((option) => {
        const isSelected = option.source === source;
        return (
          <button
            key={option.source}
            type="button"
            aria-pressed={isSelected}
            onMouseDown={keepsFocusInPlace ? preventFocusOnPress : undefined}
            onPointerEnter={isSelected ? undefined : onSwitchIntent}
            onFocus={isSelected ? undefined : onSwitchIntent}
            onClick={isSelected ? undefined : () => onSourceChange(option.source)}
            className={cn(
              "relative flex h-5 items-center justify-center gap-1 px-2 text-[11px] font-semibold leading-none transition-colors duration-200 after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
              isSelected ? "cursor-default text-white" : cn("cursor-pointer text-muted-foreground", option.hoverClassName),
            )}
          >
            <HugeiconsIcon icon={option.icon} className="size-3" aria-hidden="true" />
            <span className={alwaysLabeled ? undefined : "sr-only sm:not-sr-only"}>{t(option.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}
