import { Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { QueueDialog } from "./queueDialog";
import { ReasonField } from "./reasonField";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

type ReadingBlockDialogProps = {
  open: boolean;
  description: string;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
};

type ReadingBlockFormProps = Omit<ReadingBlockDialogProps, "open" | "onOpenChange"> & {
  onCancel: () => void;
};

function ReadingBlockForm({ description, isPending, onConfirm, onCancel }: ReadingBlockFormProps) {
  const { t } = useTranslation(["admin", "common"]);
  const [reason, setReason] = useState("");
  const trimmedReason = reason.trim();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmedReason !== "" && !isPending) onConfirm(trimmedReason);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader className="pr-7">
        <DialogTitle>{t("observationFlags.apply.readingBlock.title")}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <ReasonField
        label={t("observationFlags.ignore.reasonLabel")}
        placeholder={t("observationFlags.apply.readingBlock.reasonPlaceholder")}
        hint={t("observationFlags.apply.readingBlock.hint")}
        value={reason}
        isDisabled={isPending}
        onChange={setReason}
      />
      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" className="cursor-pointer" disabled={trimmedReason === "" || isPending}>
          {isPending ? <Spinner /> : <HugeiconsIcon icon={Tick02Icon} data-icon="inline-start" aria-hidden="true" />}
          {t("observationFlags.apply.readingBlock.confirm")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ReadingBlockDialog({ open, isPending, onOpenChange, ...formProps }: ReadingBlockDialogProps) {
  return (
    <QueueDialog open={open} isPending={isPending} onOpenChange={onOpenChange}>
      <ReadingBlockForm {...formProps} isPending={isPending} onCancel={() => onOpenChange(false)} />
    </QueueDialog>
  );
}
