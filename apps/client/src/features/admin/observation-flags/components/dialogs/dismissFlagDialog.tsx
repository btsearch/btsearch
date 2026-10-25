import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ObservationFlag, ObservationFlagUpdate } from "@openbts/shared/contract";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { updateFlag } from "../../api/flags";
import { type QueueConflict, reportQueueError } from "../../model/conflicts";
import { QueueDialog } from "./queueDialog";
import { ReasonField } from "./reasonField";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";

type DismissedReason = Extract<ObservationFlagUpdate, { status: "dismissed" }>["dismissedReason"];

type DismissFlagDialogProps = {
  flagId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDismissed: (flag: ObservationFlag) => void;
  onConflict: (conflict: QueueConflict) => void;
};

type DismissFormProps = Omit<DismissFlagDialogProps, "open" | "onOpenChange"> & {
  onPendingChange: (isPending: boolean) => void;
  onCancel: () => void;
};

const DISMISS_REASONS: readonly DismissedReason[] = ["notAnIssue", "cannotVerify", "needsSurvey"];

function isDismissedReason(value: unknown): value is DismissedReason {
  return DISMISS_REASONS.some((reason) => reason === value);
}

function DismissForm({ flagId, onDismissed, onConflict, onPendingChange, onCancel }: DismissFormProps) {
  const { t } = useTranslation(["admin", "common"]);
  const [reason, setReason] = useState<DismissedReason | null>(null);
  const [note, setNote] = useState("");
  const dismissMutation = useMutation({
    mutationFn: (change: ObservationFlagUpdate) => updateFlag(flagId, change),
    onMutate: () => onPendingChange(true),
    onSettled: () => onPendingChange(false),
    onSuccess: onDismissed,
    onError: (error) => reportQueueError(error, onConflict),
  });
  const isPending = dismissMutation.isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason === null || isPending) return;
    const trimmedNote = note.trim();
    dismissMutation.mutate({ status: "dismissed", dismissedReason: reason, ...(trimmedNote === "" ? {} : { note: trimmedNote }) });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader className="pr-7">
        <DialogTitle>{t("observationFlags.dismiss.title")}</DialogTitle>
        <DialogDescription>{t("observationFlags.dismiss.description")}</DialogDescription>
      </DialogHeader>
      <RadioGroup
        aria-label={t("observationFlags.dismiss.reasonLabel")}
        value={reason}
        onValueChange={(value) => {
          if (isDismissedReason(value)) setReason(value);
        }}
        disabled={isPending}
        className="gap-1"
      >
        {DISMISS_REASONS.map((option) => (
          <label
            key={option}
            className="flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors hover:bg-muted/50 has-[[data-checked]]:bg-primary/10"
          >
            <RadioGroupItem value={option} className="mt-0.5 cursor-pointer" />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm font-medium">{t(`observationFlags.dismissReasons.${option}.label`)}</span>
              <span className="text-xs text-muted-foreground">{t(`observationFlags.dismissReasons.${option}.hint`)}</span>
            </span>
          </label>
        ))}
      </RadioGroup>
      <ReasonField
        label={t("observationFlags.dismiss.noteLabel")}
        placeholder={t("common:placeholder.optional")}
        value={note}
        isDisabled={isPending}
        onChange={setNote}
      />
      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" className="cursor-pointer" disabled={reason === null || isPending}>
          {isPending ? <Spinner /> : <HugeiconsIcon icon={Cancel01Icon} data-icon="inline-start" aria-hidden="true" />}
          {t("observationFlags.dismiss.confirm")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function DismissFlagDialog({ open, onOpenChange, ...formProps }: DismissFlagDialogProps) {
  const [isPending, setIsPending] = useState(false);

  return (
    <QueueDialog open={open} isPending={isPending} onOpenChange={onOpenChange}>
      <DismissForm {...formProps} onPendingChange={setIsPending} onCancel={() => onOpenChange(false)} />
    </QueueDialog>
  );
}
