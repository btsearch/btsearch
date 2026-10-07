import type { AnnouncementType } from "@openbts/shared/contract";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Field, FieldTitle } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { FULL_WIDTH_SEGMENTS_CLASS } from "@/features/admin/reference/components/shared/referenceCards";
import { SegmentedControl } from "@/features/settings/components/settingsPrimitives";

type AnnouncementOptionsProps = {
  type: AnnouncementType;
  isEnabled: boolean;
  onTypeChange: (type: AnnouncementType) => void;
  onEnabledChange: (isEnabled: boolean) => void;
};

export function AnnouncementOptions({ type, isEnabled, onTypeChange, onEnabledChange }: AnnouncementOptionsProps) {
  const { t } = useTranslation("admin");
  const typeTitleId = useId();
  const showTitleId = useId();
  const typeOptions: { value: AnnouncementType; label: string }[] = [
    { value: "info", label: t("settings.announcementTypeInfo") },
    { value: "warning", label: t("settings.announcementTypeWarning") },
    { value: "error", label: t("settings.announcementTypeError") },
  ];

  return (
    <div className="flex flex-col gap-4 @4xl:w-75 @4xl:shrink-0">
      <Field>
        <FieldTitle id={typeTitleId}>{t("common:labels.type")}</FieldTitle>
        <SegmentedControl
          value={type}
          options={typeOptions}
          onValueChange={onTypeChange}
          ariaLabelledBy={typeTitleId}
          className={FULL_WIDTH_SEGMENTS_CLASS}
        />
      </Field>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <FieldTitle id={showTitleId}>{t("settings.announcementForm.show")}</FieldTitle>
          <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{t("settings.announcementForm.showHint")}</p>
        </div>
        <Switch checked={isEnabled} onCheckedChange={onEnabledChange} aria-labelledby={showTitleId} className="cursor-pointer" />
      </div>
    </div>
  );
}
