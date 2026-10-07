import { SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { EDIT_LIMITS } from "@/features/station-editing/model/validate";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type SendButtonProps = {
  isDelete: boolean;
  isStored: boolean;
  isSending: boolean;
  canSend: boolean;
  onSend: () => void;
  size?: "default" | "sm";
  className?: string;
};

type SubmitSectionProps = Omit<SendButtonProps, "className" | "size"> & {
  note: string;
  noteError: string | null;
  pendingCount: number;
  hasSendButton: boolean;
  onNoteChange: (note: string) => void;
};

export function SendButton({ isDelete, isStored, isSending, canSend, onSend, size = "default", className }: SendButtonProps) {
  const { t } = useTranslation("common");
  const idleLabel = isStored ? t("actions.update") : t("actions.submit");
  const busyLabel = isStored ? t("actions.updating") : t("actions.submitting");

  return (
    <Button
      type="button"
      variant={isDelete ? "destructive" : "default"}
      size={size}
      disabled={!canSend || isSending}
      onClick={onSend}
      className={cn("cursor-pointer font-semibold", className)}
    >
      {isSending ? busyLabel : idleLabel}
      {isSending ? <Spinner data-icon="inline-end" /> : <HugeiconsIcon icon={SentIcon} aria-hidden="true" data-icon="inline-end" />}
    </Button>
  );
}

export function SubmitSection({
  note,
  noteError,
  pendingCount,
  isDelete,
  isStored,
  isSending,
  canSend,
  hasSendButton,
  onNoteChange,
  onSend,
}: SubmitSectionProps) {
  const { t } = useTranslation("submissions");
  const noteId = useId();
  const noteErrorId = `${noteId}-error`;

  return (
    <div className="flex flex-col gap-2.5">
      {isDelete ? <p className="text-xs font-medium text-destructive">{t("deleteStation.warning")}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={noteId} className="text-xs">
          {t("form.noteLabel")}
        </Label>
        {isDelete ? null : (
          <span className={cn("text-xs", pendingCount > 0 ? "text-muted-foreground" : "text-amber-600 dark:text-amber-500")}>
            {pendingCount > 0 ? t("form.changesToSend", { count: pendingCount }) : t("form.nothingChanged")}
          </span>
        )}
      </div>
      <Textarea
        {...NO_AUTOFILL_PROPS}
        id={noteId}
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder={isDelete ? t("deleteStation.reasonPlaceholder") : t("form.summaryPlaceholder")}
        maxLength={EDIT_LIMITS.submissionNote}
        disabled={isSending}
        aria-invalid={noteError === null ? undefined : true}
        aria-describedby={noteError === null ? undefined : noteErrorId}
        rows={2}
        className="min-h-15 resize-none text-sm"
      />
      {noteError === null ? null : (
        <p id={noteErrorId} role="alert" className="text-xs text-destructive">
          {noteError}
        </p>
      )}
      {hasSendButton ? (
        <SendButton isDelete={isDelete} isStored={isStored} isSending={isSending} canSend={canSend} onSend={onSend} className="w-full" />
      ) : null}
    </div>
  );
}
