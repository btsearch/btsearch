import type { IconSvgElement } from "@hugeicons/react";
import { type FormEvent, type ReactNode, useId } from "react";

import { SettingsFormFooter } from "../settingsFormFooter";
import { SettingsCard, SettingsCardHeader } from "@/features/settings/components/settingsPrimitives";

type MeasurementFormCardProps = {
  icon: IconSvgElement;
  title: string;
  description: string;
  isDirty: boolean;
  isSaving: boolean;
  canSave: boolean;
  onRevert: () => void;
  onSubmit: () => void;
  children: ReactNode;
};

export function MeasurementFormCard({
  icon,
  title,
  description,
  isDirty,
  isSaving,
  canSave,
  onRevert,
  onSubmit,
  children,
}: MeasurementFormCardProps) {
  const formId = useId();
  const titleId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSave) onSubmit();
  }

  return (
    <SettingsCard className="@container">
      <SettingsCardHeader icon={icon} title={title} titleId={titleId} description={description} />
      <form
        id={formId}
        aria-labelledby={titleId}
        noValidate
        data-save-shortcut
        onSubmit={handleSubmit}
        className="grid flex-1 content-start gap-5 border-t px-4 pt-4 pb-5 sm:px-5 @md:grid-cols-2"
      >
        {children}
      </form>
      <SettingsFormFooter formId={formId} isDirty={isDirty} isSaving={isSaving} canSave={canSave} onRevert={onRevert} />
    </SettingsCard>
  );
}
