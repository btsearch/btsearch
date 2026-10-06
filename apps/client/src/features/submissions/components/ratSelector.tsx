import { SignalFull02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { GenerationTag } from "@/features/shared/RatGenerationLabel";
import type { StationDraftApi } from "@/features/station-editing/hooks/useStationDraft";
import { RAT_FIELDS, RAT_ORDER } from "@/features/station-editing/model/ratFields";
import type { Rat } from "@/features/station-editing/model/types";
import { cn } from "@/lib/utils";

type RatSelectorProps = {
  edit: StationDraftApi;
};

const CHIP_CLASS = cn(
  "flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium",
  "transition-colors disabled:cursor-default",
);
const SELECTED_CHIP_CLASS = "border-primary bg-primary text-primary-foreground shadow-sm";
const IDLE_CHIP_CLASS = "border-border bg-background text-foreground enabled:hover:bg-muted dark:border-input dark:bg-input/30";

export function RatSelector({ edit }: RatSelectorProps) {
  const { t } = useTranslation("submissions");
  const { session, dispatch, canEdit } = edit;
  const { enabledRats } = session;

  function toggleRat(rat: Rat) {
    const rats = enabledRats.includes(rat) ? enabledRats.filter((enabledRat) => enabledRat !== rat) : [...enabledRats, rat];
    dispatch({ type: "setEnabledRats", rats });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={SignalFull02Icon} aria-hidden="true" className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">{t("ratSelector.title")}</span>
      </div>
      <p className="text-xs text-muted-foreground">{t("ratSelector.intro")}</p>
      <div className="flex flex-wrap gap-1.5">
        {RAT_ORDER.map((rat) => {
          const isSelected = enabledRats.includes(rat);
          const hasCells = session.draft.cells.some((cell) => cell.rat === rat);

          return (
            <button
              key={rat}
              type="button"
              aria-pressed={isSelected}
              disabled={!canEdit || hasCells}
              onClick={() => toggleRat(rat)}
              className={cn(CHIP_CLASS, isSelected ? SELECTED_CHIP_CLASS : IDLE_CHIP_CLASS, canEdit ? null : "opacity-50")}
            >
              <GenerationTag active={isSelected}>{RAT_FIELDS[rat].generation}</GenerationTag>
              <span>{RAT_FIELDS[rat].name}</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground">{t("ratSelector.iotHint")}</p>
    </div>
  );
}
