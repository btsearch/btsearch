import type { List } from "@openbts/shared/contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { refreshChangedListQueries } from "../api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DialogFormFooter } from "@/features/admin/reference/components/shared/dialogFormFooter";
import { useOpeningCount } from "@/features/admin/reference/components/shared/useOpeningCount";
import { getPickerUserName } from "@/features/admin/users/picker/pickerUser";
import { LIST_DESCRIPTION_MAX_LENGTH, LIST_NAME_MAX_LENGTH, updateList } from "@/features/lists/api";
import { isConflict, showApiError } from "@/lib/api";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

type ListFields = {
  name: string;
  description: string | null;
};

type AdminListEditDialogProps = {
  list: List;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type ListEditFormProps = {
  list: List;
  isPending: boolean;
  onSubmit: (fields: ListFields, onNameTaken: () => void) => void;
  onCancel: () => void;
};

function ListEditForm({ list, isPending, onSubmit, onCancel }: ListEditFormProps) {
  const { t } = useTranslation(["admin", "common", "lists"]);
  const nameId = useId();
  const nameErrorId = useId();
  const descriptionId = useId();
  const [name, setName] = useState(list.name);
  const [description, setDescription] = useState(list.description ?? "");
  const [takenName, setTakenName] = useState<string | null>(null);

  const fields: ListFields = { name: name.trim(), description: description.trim() || null };
  const isNameTaken = takenName === fields.name;
  const isChanged = fields.name !== list.name || fields.description !== (list.description || null);
  const canSubmit = fields.name !== "" && !isNameTaken && isChanged && !isPending;
  const ownerName = list.owner === undefined ? null : getPickerUserName(list.owner);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) onSubmit(fields, () => setTakenName(fields.name));
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{t("lists:editList")}</DialogTitle>
        {ownerName === null ? null : <DialogDescription>{t("admin:lists.edit.ownerLine", { name: ownerName })}</DialogDescription>}
      </DialogHeader>
      <Field data-invalid={isNameTaken || undefined}>
        <FieldLabel htmlFor={nameId}>{t("common:labels.name")}</FieldLabel>
        <Input
          {...NO_AUTOFILL_PROPS}
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={LIST_NAME_MAX_LENGTH}
          disabled={isPending}
          required
          aria-invalid={isNameTaken || undefined}
          aria-describedby={isNameTaken ? nameErrorId : undefined}
        />
        {isNameTaken ? <FieldError id={nameErrorId}>{t("admin:lists.edit.nameTaken")}</FieldError> : null}
      </Field>
      <Field>
        <FieldLabel htmlFor={descriptionId}>{t("lists:description")}</FieldLabel>
        <Input
          {...NO_AUTOFILL_PROPS}
          id={descriptionId}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("common:placeholder.optional")}
          maxLength={LIST_DESCRIPTION_MAX_LENGTH}
          disabled={isPending}
        />
      </Field>
      <DialogFormFooter submitLabel={t("common:actions.save")} canSubmit={canSubmit} isPending={isPending} onCancel={onCancel} />
    </form>
  );
}

export function AdminListEditDialog({ list, open, onOpenChange }: AdminListEditDialogProps) {
  const { t } = useTranslation("lists");
  const queryClient = useQueryClient();
  const openingCount = useOpeningCount(open);

  const saveMutation = useMutation({
    mutationFn: (fields: ListFields) => updateList(list.id, fields),
    onSuccess: () => {
      onOpenChange(false);
      void refreshChangedListQueries(queryClient, list.id);
      toast.success(t("lists:updated"));
    },
    onError: (error) => {
      if (!isConflict(error)) showApiError(error);
    },
  });

  function saveList(fields: ListFields, onNameTaken: () => void) {
    if (!open) return;

    saveMutation.mutate(fields, {
      onError: (error) => {
        if (isConflict(error)) onNameTaken();
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saveMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <ListEditForm key={openingCount} list={list} isPending={saveMutation.isPending} onSubmit={saveList} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
