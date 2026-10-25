import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { DialogCheckbox } from "./dialogCheckbox";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useOpeningCount } from "@/features/admin/reference/components/shared/useOpeningCount";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

export const REASON_MAX_LENGTH = 500;

type ReasonDialogProps = {
  open: boolean;
  title: string;
  description: string;
  hint?: string;
  initialReason?: string;
  isReasonRequired?: boolean;
  confirmLabel: string;
  isDestructive?: boolean;
  refold?: { label: string; description: string };
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string, refold: boolean) => void;
};

type ReasonFormProps = Omit<ReasonDialogProps, "open" | "onOpenChange"> & { onCancel: () => void };

function ReasonForm({
  title,
  description,
  hint,
  initialReason = "",
  isReasonRequired = true,
  confirmLabel,
  isDestructive = false,
  refold,
  isPending,
  onCancel,
  onSubmit,
}: ReasonFormProps) {
  const { t } = useTranslation("admin");
  const reasonId = useId();
  const [reason, setReason] = useState(initialReason);
  const [isRefoldChosen, setIsRefoldChosen] = useState(false);
  const trimmedReason = reason.trim();
  const isUnchanged = initialReason !== "" && trimmedReason === initialReason.trim();
  const canSubmit = (!isReasonRequired || trimmedReason !== "") && !isUnchanged && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) onSubmit(trimmedReason, refold !== undefined && isRefoldChosen);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor={reasonId}>{t("measurements.reason")}</FieldLabel>
        <Input
          {...NO_AUTOFILL_PROPS}
          id={reasonId}
          value={reason}
          maxLength={REASON_MAX_LENGTH}
          placeholder={isReasonRequired ? undefined : t("common:placeholder.optional")}
          required={isReasonRequired}
          disabled={isPending}
          onChange={(event) => setReason(event.target.value)}
        />
        {hint === undefined ? null : <FieldDescription>{hint}</FieldDescription>}
      </Field>
      {refold === undefined ? null : (
        <DialogCheckbox
          label={refold.label}
          description={refold.description}
          checked={isRefoldChosen}
          disabled={isPending}
          onCheckedChange={setIsRefoldChosen}
        />
      )}
      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" variant={isDestructive ? "destructive" : "default"} className="cursor-pointer" disabled={!canSubmit}>
          {isPending ? <Spinner /> : null}
          {confirmLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ReasonDialog({ open, onOpenChange, ...formProps }: ReasonDialogProps) {
  const openingCount = useOpeningCount(open);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!formProps.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <ReasonForm key={openingCount} {...formProps} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
