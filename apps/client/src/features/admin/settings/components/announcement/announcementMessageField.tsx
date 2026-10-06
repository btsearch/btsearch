import { type RefObject, useId } from "react";
import { useTranslation } from "react-i18next";

import { ANNOUNCEMENT_MESSAGE_MAX_LENGTH } from "../../utils/announcementDraft";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type AnnouncementMessageFieldProps = {
  message: string;
  isTooLong: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onMessageChange: (message: string) => void;
};

export function AnnouncementMessageField({ message, isTooLong, textareaRef, onMessageChange }: AnnouncementMessageFieldProps) {
  const { t } = useTranslation("admin");
  const fieldId = useId();
  const hintId = useId();

  return (
    <Field className="min-w-0 @4xl:flex-1">
      <FieldLabel htmlFor={fieldId}>{t("settings.announcementMessage")}</FieldLabel>
      <Textarea
        {...NO_AUTOFILL_PROPS}
        ref={textareaRef}
        id={fieldId}
        rows={3}
        maxLength={ANNOUNCEMENT_MESSAGE_MAX_LENGTH}
        value={message}
        onChange={(event) => onMessageChange(event.target.value)}
        placeholder={t("settings.announcementMessagePlaceholder")}
        aria-invalid={isTooLong || undefined}
        aria-describedby={hintId}
        className="min-h-21"
      />
      <div className="flex items-start gap-3 text-xs leading-4 text-muted-foreground">
        <p id={hintId} className="min-w-0 flex-1">
          {t("settings.announcementForm.linksHint")}
        </p>
        <p className={cn("shrink-0 tabular-nums", isTooLong && "text-destructive")}>
          {message.length} / {ANNOUNCEMENT_MESSAGE_MAX_LENGTH}
        </p>
      </div>
    </Field>
  );
}
