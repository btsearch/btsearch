import type { MeasurementReadingBlockCreate } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { invalidateReadingBlockQueries, measurementsAdminKeys } from "../api/keys";
import { createReadingBlock } from "../api/readingBlocks";
import { DialogCheckbox } from "../components/dialogCheckbox";
import { REASON_MAX_LENGTH } from "../components/reasonDialog";
import { BlockConditionsFields } from "./blockConditionsFields";
import { type BlockDialogSource, type BlockDraft, createBlockDraft, toBlockCreate } from "./blockDraft";
import { BlockPhonesField } from "./blockPhonesField";
import { BlockScopeFields } from "./blockScopeFields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useOpeningCount } from "@/features/admin/reference/components/shared/useOpeningCount";
import { DialogNote } from "@/features/admin/users/components/detail/userDetailPrimitives";
import { showApiError } from "@/lib/api";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

type ReadingBlockDialogProps = {
  open: boolean;
  source: BlockDialogSource;
  onOpenChange: (open: boolean) => void;
};

type BlockFormProps = Omit<ReadingBlockDialogProps, "open" | "onOpenChange"> & {
  isPending: boolean;
  onSubmit: (block: MeasurementReadingBlockCreate) => void;
  onCancel: () => void;
};

function getSourceNote(t: TFunction, source: BlockDialogSource): string | null {
  if (source.kind === "flag") return t("measurements.blocks.dialog.fromFlag", { id: source.flag.id });
  if (source.kind === "readerVersion") return t("measurements.blocks.dialog.fromReader");
  return null;
}

function BlockForm({ source, isPending, onSubmit, onCancel }: BlockFormProps) {
  const { t } = useTranslation("admin");
  const reasonId = useId();
  const [draft, setDraft] = useState(() => createBlockDraft(source));
  const block = toBlockCreate(draft);
  const note = getSourceNote(t, source);

  function changeDraft(change: Partial<BlockDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (block !== null && !isPending) onSubmit(block);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader className="pr-6">
        <DialogTitle>{t("measurements.blocks.dialog.title")}</DialogTitle>
        <DialogDescription>{t("measurements.blocks.dialog.description")}</DialogDescription>
      </DialogHeader>
      {note === null ? null : <DialogNote>{note}</DialogNote>}
      <BlockPhonesField draft={draft} disabled={isPending} onChange={changeDraft} />
      <BlockScopeFields draft={draft} disabled={isPending} onChange={changeDraft} />
      <BlockConditionsFields draft={draft} disabled={isPending} onChange={changeDraft} />
      <Field>
        <FieldLabel htmlFor={reasonId}>{t("measurements.reason")}</FieldLabel>
        <Input
          {...NO_AUTOFILL_PROPS}
          id={reasonId}
          value={draft.reason}
          maxLength={REASON_MAX_LENGTH}
          disabled={isPending}
          onChange={(event) => changeDraft({ reason: event.target.value })}
        />
      </Field>
      <DialogCheckbox
        label={t("measurements.blocks.list.refold")}
        description={t("measurements.blocks.dialog.refoldDescription")}
        checked={draft.refold}
        disabled={isPending}
        onCheckedChange={(refold) => changeDraft({ refold })}
      />
      <DialogFooter>
        <Button type="button" variant="outline" className="cursor-pointer" disabled={isPending} onClick={onCancel}>
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" className="cursor-pointer" disabled={block === null || isPending}>
          {isPending ? <Spinner /> : null}
          {t("measurements.blocks.list.add")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ReadingBlockDialog({ open, source, onOpenChange }: ReadingBlockDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const openingCount = useOpeningCount(open);

  const createMutation = useMutation({
    mutationFn: createReadingBlock,
    onSuccess: async () => {
      onOpenChange(false);
      toast.success(t("measurements.blocks.dialog.created"));
      await Promise.all([
        invalidateReadingBlockQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: measurementsAdminKeys.readerQuirkFlags() }),
      ]);
    },
    onError: showApiError,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!createMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <BlockForm
          key={openingCount}
          source={source}
          isPending={createMutation.isPending}
          onSubmit={(block) => createMutation.mutate(block)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
