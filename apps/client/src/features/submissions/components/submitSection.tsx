import { SentIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";

import type { SearchStation } from "../api";
import type { ProposedStationForm, StationAction, SubmissionMode } from "../types";

export interface SubmitSectionProps {
  mode: SubmissionMode;
  action: StationAction;
  selectedStation: SearchStation | null;
  newStation: ProposedStationForm;
  cellsCount: number;
  submitterNote: string;
  onSubmitterNoteChange: (note: string) => void;
  canSubmit: boolean;
  isSubmitting: boolean;
  isPending: boolean;
  isSuccess: boolean;
  isEditMode: boolean;
  hasChanges: boolean;
}

export function SubmitSection({
  mode,
  action,
  selectedStation,
  submitterNote,
  onSubmitterNoteChange,
  canSubmit,
  isSubmitting,
  isPending,
  isSuccess,
  isEditMode,
  hasChanges,
}: SubmitSectionProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const isDeleteAction = action === "delete";
  const notePlaceholder = isDeleteAction ? t("deleteStation.reasonPlaceholder") : t("form.summaryPlaceholder");
  const buttonIcon = isSuccess ? Tick02Icon : SentIcon;
  const isLoading = isSubmitting || isPending;

  function getButtonText(): string {
    if (isLoading) return t(isEditMode ? "common:actions.updating" : "common:actions.submitting");
    if (isSuccess) return t("common:actions.submitted");
    if (isEditMode) return t("common:actions.update");
    return t("common:actions.submit");
  }

  const buttonText = getButtonText();

  const showNoChangesMessage = !hasChanges && (mode === "new" || selectedStation) && !isDeleteAction;

  return (
    <div className="pt-3 border-t space-y-3">
      {!isDeleteAction && isPending && <div className="text-xs text-muted-foreground">{t("form.summary")}</div>}
      {isDeleteAction && <div className="text-xs text-destructive font-medium">{t("deleteStation.warning")}</div>}
      {showNoChangesMessage && <div className="text-xs text-amber-600 dark:text-amber-500">{t("form.noChanges")}</div>}
      {(mode === "new" || selectedStation) && (
        <Textarea
          placeholder={notePlaceholder}
          value={submitterNote}
          onChange={(e) => onSubmitterNoteChange(e.target.value)}
          className="min-h-15 text-sm resize-none"
          rows={2}
        />
      )}
      <Button
        type="submit"
        disabled={!canSubmit || isSubmitting || isPending}
        variant={isDeleteAction ? "destructive" : "default"}
        className="w-full font-semibold"
      >
        {buttonText}
        {isLoading ? <Spinner data-icon="inline-end" /> : <HugeiconsIcon icon={buttonIcon} className="size-4" data-icon="inline-end" />}
      </Button>
    </div>
  );
}
