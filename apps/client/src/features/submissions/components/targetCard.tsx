import { PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

import type { StationAction, SubmissionMode } from "../types";
import { ActionSelector } from "./actionSelector";
import { StationSelector, type TargetStation } from "./stationSelector";
import type { StationSearchHit } from "@/features/map/searchApi";

export type TargetControls = {
  onModeChange: (mode: SubmissionMode) => void;
  onStationPick: (station: StationSearchHit) => void;
  onStationClear: () => void;
};

export type TargetActionChoice = {
  action: StationAction;
  onActionChange: (action: StationAction) => void;
};

type TargetCardProps = {
  mode: SubmissionMode;
  station: TargetStation | null;
  controls: TargetControls | null;
  actionChoice?: TargetActionChoice | null;
  editedSubmissionId?: string | null;
  isStationLoading?: boolean;
  stationError?: ReactElement | null;
  isBusy?: boolean;
  focusesModeSwitch?: boolean;
};

function ignoreChange(): void {}

export function TargetCard({
  mode,
  station,
  controls,
  actionChoice = null,
  editedSubmissionId = null,
  isStationLoading = false,
  stationError = null,
  isBusy = false,
  focusesModeSwitch = false,
}: TargetCardProps) {
  const { t } = useTranslation("submissions");
  const isLocked = controls === null || isBusy;

  return (
    <div className="flex flex-col gap-4">
      {editedSubmissionId === null ? null : (
        <div className="flex items-center justify-between gap-3 rounded-xl border bg-muted/50 px-4 py-3">
          <div className="flex shrink-0 items-center gap-2.5">
            <HugeiconsIcon icon={PencilEdit02Icon} aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <p className="text-sm text-foreground/80">{t("form.editingBanner")}</p>
          </div>
          <span
            title={editedSubmissionId}
            className="min-w-0 truncate rounded-md border bg-background px-2 py-0.5 font-mono text-sm font-semibold text-foreground"
          >
            #{editedSubmissionId}
          </span>
        </div>
      )}
      <div className="relative rounded-xl border">
        <StationSelector
          mode={mode}
          station={station}
          isStationLoading={isStationLoading}
          stationError={stationError}
          isLocked={isLocked}
          focusesModeSwitch={focusesModeSwitch}
          onModeChange={controls?.onModeChange ?? ignoreChange}
          onStationPick={controls?.onStationPick ?? ignoreChange}
          onStationClear={controls?.onStationClear ?? ignoreChange}
        />
        {actionChoice === null ? null : (
          <ActionSelector action={actionChoice.action} isLocked={isLocked} onActionChange={actionChoice.onActionChange} />
        )}
      </div>
    </div>
  );
}
