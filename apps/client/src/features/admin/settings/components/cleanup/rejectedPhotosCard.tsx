import { CheckmarkCircle02Icon, Delete02Icon, Image01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { RejectedPhotoRemoval } from "@openbts/shared/contract";
import { useMutation } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { removeRejectedSubmissionPhotos } from "../../api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/features/settings/components/confirmDialog";
import { SettingsCard, SettingsCardNote, SettingsRow } from "@/features/settings/components/settingsPrimitives";
import { showApiError } from "@/lib/api";

function getRemovalSummary(t: TFunction, removal: RejectedPhotoRemoval): string {
  if (removal.photos === 0 && !removal.hasMore) return t("admin:settings.photoCleanup.nothing");

  const counts = {
    photos: t("admin:settings.photoCleanup.photoCount", { count: removal.photos }),
    submissions: t("admin:settings.photoCleanup.submissionCount", { count: removal.submissions }),
  };
  return removal.hasMore ? t("admin:settings.photoCleanup.resultMore", counts) : t("admin:settings.photoCleanup.resultDone", counts);
}

export function RejectedPhotosCard() {
  const { t } = useTranslation("admin");
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [lastRemoval, setLastRemoval] = useState<RejectedPhotoRemoval | null>(null);
  const removal = useMutation({
    mutationFn: removeRejectedSubmissionPhotos,
    onSuccess: (removed) => setLastRemoval(removed),
    onError: showApiError,
  });

  const isRemoving = removal.isPending;
  const hasMore = lastRemoval?.hasMore === true;

  function removePhotos() {
    if (!isConfirmOpen || isRemoving) return;

    setIsConfirmOpen(false);
    removal.mutate();
  }

  return (
    <SettingsCard>
      <SettingsRow icon={Image01Icon} title={t("settings.photoCleanup.title")} description={t("settings.photoCleanup.description")} wrap>
        <div className="max-sm:pl-11.5">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="cursor-pointer data-disabled:pointer-events-none data-disabled:opacity-50"
            disabled={isRemoving}
            focusableWhenDisabled
            onClick={() => setIsConfirmOpen(true)}
          >
            {isRemoving ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" aria-hidden="true" />}
            {hasMore ? t("settings.photoCleanup.runMore") : t("settings.photoCleanup.run")}
          </Button>
        </div>
      </SettingsRow>
      {lastRemoval === null ? null : <SettingsCardNote icon={CheckmarkCircle02Icon}>{getRemovalSummary(t, lastRemoval)}</SettingsCardNote>}
      <ConfirmDialog
        open={isConfirmOpen}
        onOpenChange={setIsConfirmOpen}
        title={t("settings.photoCleanup.confirm.title")}
        description={t("settings.photoCleanup.confirm.description")}
        confirmLabel={t("settings.photoCleanup.confirm.action")}
        onConfirm={removePhotos}
      />
    </SettingsCard>
  );
}
