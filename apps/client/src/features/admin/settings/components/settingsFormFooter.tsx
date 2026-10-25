import { AlertCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { SMALL_TEXT_CLASS, WARNING_TEXT_CLASS } from "./classNames";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SettingsCardFooter } from "@/features/settings/components/settingsPrimitives";
import { cn } from "@/lib/utils";

type SettingsFormFooterProps = {
  formId: string;
  isDirty: boolean;
  isSaving: boolean;
  canSave: boolean;
  error?: string | null;
  onRevert: () => void;
};

const FOOTER_NOTE_CLASS = cn("flex items-center gap-1.5", SMALL_TEXT_CLASS);

function FooterNote({ isDirty, error }: { isDirty: boolean; error: string | null }) {
  const { t } = useTranslation("admin");

  if (error !== null) {
    return (
      <p role="alert" className={cn(FOOTER_NOTE_CLASS, "text-destructive")}>
        <HugeiconsIcon icon={AlertCircleIcon} aria-hidden="true" className="size-3.5 shrink-0" />
        {error}
      </p>
    );
  }
  if (!isDirty) return null;

  return <p className={cn(FOOTER_NOTE_CLASS, WARNING_TEXT_CLASS)}>{t("settings.form.unsaved")}</p>;
}

export function SettingsFormFooter({ formId, isDirty, isSaving, canSave, error = null, onRevert }: SettingsFormFooterProps) {
  const { t } = useTranslation("admin");

  return (
    <SettingsCardFooter>
      <FooterNote isDirty={isDirty} error={error} />
      <div className="ml-auto flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" className="cursor-pointer" disabled={!isDirty || isSaving} onClick={onRevert}>
          {t("settings.form.revert")}
        </Button>
        <Button type="submit" form={formId} size="sm" className="cursor-pointer" disabled={!canSave}>
          {isSaving ? <Spinner /> : null}
          {t("common:actions.save")}
        </Button>
      </div>
    </SettingsCardFooter>
  );
}
