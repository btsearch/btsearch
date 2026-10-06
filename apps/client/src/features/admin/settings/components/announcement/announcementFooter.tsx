import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { SMALL_TEXT_CLASS, WARNING_TEXT_CLASS } from "../classNames";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SettingsCardFooter } from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

type AnnouncementFooterNoteProps = {
  isDirty: boolean;
  isMessageMissing: boolean;
};

type AnnouncementFooterProps = AnnouncementFooterNoteProps & {
  formId: string;
  isSaving: boolean;
  canSave: boolean;
  onRevert: () => void;
};

const FOOTER_NOTE_CLASS = cn("flex items-center gap-1.5", SMALL_TEXT_CLASS);

function AnnouncementFooterNote({ isDirty, isMessageMissing }: AnnouncementFooterNoteProps) {
  const { t } = useTranslation("admin");

  if (isMessageMissing) {
    return (
      <p role="alert" className={cn(FOOTER_NOTE_CLASS, "text-destructive")}>
        <HugeiconsIcon icon={AlertCircleIcon} aria-hidden="true" className="size-3.5 shrink-0" />
        {t("settings.announcementForm.messageRequired")}
      </p>
    );
  }
  if (!isDirty) return null;

  return (
    <p className={cn(FOOTER_NOTE_CLASS, WARNING_TEXT_CLASS)}>
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {t("settings.announcementForm.unsaved")}
    </p>
  );
}

export function AnnouncementFooter({ formId, isDirty, isMessageMissing, isSaving, canSave, onRevert }: AnnouncementFooterProps) {
  const { t } = useTranslation("admin");

  return (
    <SettingsCardFooter>
      <AnnouncementFooterNote isDirty={isDirty} isMessageMissing={isMessageMissing} />
      <div className="ml-auto flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" className="cursor-pointer" disabled={!isDirty || isSaving} onClick={onRevert}>
          {t("settings.announcementForm.revert")}
        </Button>
        <Button type="submit" form={formId} size="sm" className="cursor-pointer" disabled={!canSave}>
          {isSaving ? <Spinner /> : null}
          {t("common:actions.save")}
        </Button>
      </div>
    </SettingsCardFooter>
  );
}
