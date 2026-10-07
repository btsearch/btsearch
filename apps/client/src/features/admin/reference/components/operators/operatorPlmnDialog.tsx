import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { updateOperator } from "../../api/operators";
import type { Operator, Plmn, PlmnInput, PlmnRole } from "../../types";
import { getReferenceErrorMessage, showReferenceError } from "../../utils/errors";
import { formatPlmn } from "../../utils/plmn";
import { DialogFormFooter } from "../shared/dialogFormFooter";
import { FULL_WIDTH_SEGMENTS_CLASS, SegmentedControl } from "../shared/referenceCards";
import { useOpeningCount } from "../shared/useOpeningCount";
import { storeUpdatedOperator } from "./operatorCache";
import { PlmnCodeFields, getPlmnOwnerText, getPlmnProblemText } from "./operatorFields";
import { findPlmnOwner, listPlmnsWithSaved, readPlmnEntry } from "./operatorPlmns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldTitle } from "@/components/ui/field";
import { operatorsQueryOptions } from "@/features/shared/lookups";
import { isConflict } from "@/lib/api";

type PlmnDraft = {
  mcc: string;
  mnc: string;
  role: PlmnRole;
};

type PlmnFormProps = {
  operator: Operator;
  editedPlmn: Plmn | null;
  isPending: boolean;
  onSubmit: (plmns: PlmnInput[], onRefused: (reason: string) => void) => void;
  onCancel: () => void;
};

type OperatorPlmnDialogProps = {
  operator: Operator;
  editedPlmn: Plmn | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SAVE_FAILED_KEY = "admin:reference.operator.plmn.dialog.saveFailed";

function toPlmnDraft(operator: Operator, editedPlmn: Plmn | null): PlmnDraft {
  if (editedPlmn !== null) return { mcc: editedPlmn.mcc, mnc: editedPlmn.mnc, role: editedPlmn.role };
  return { mcc: "", mnc: "", role: operator.plmns.some((plmn) => plmn.role === "primary") ? "secondary" : "primary" };
}

function PlmnForm({ operator, editedPlmn, isPending, onSubmit, onCancel }: PlmnFormProps) {
  const { t } = useTranslation("admin");
  const roleTitleId = useId();
  const [shownOperator] = useState(operator);
  const [draft, setDraft] = useState(() => toPlmnDraft(operator, editedPlmn));
  const [isCodeChecked, setIsCodeChecked] = useState(editedPlmn !== null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const { data: operators } = useQuery(operatorsQueryOptions());

  const { role } = draft;
  const isEditing = editedPlmn !== null;
  const replacedPlmn = editedPlmn?.plmn ?? null;
  const ownPlmns = shownOperator.plmns;
  const entry = readPlmnEntry(draft.mcc, draft.mnc);
  const plmn = entry.plmn;
  const owner = findPlmnOwner(operators, plmn, shownOperator.id);
  const isAlreadyAdded = plmn !== null && plmn !== replacedPlmn && ownPlmns.some((ownPlmn) => ownPlmn.plmn === plmn);
  const otherPrimary = ownPlmns.find((ownPlmn) => ownPlmn.role === "primary" && ownPlmn.plmn !== replacedPlmn);
  const isUnchanged = editedPlmn !== null && plmn === editedPlmn.plmn && role === editedPlmn.role;
  const canSubmit = plmn !== null && owner === null && !isAlreadyAdded && !isUnchanged && !isPending;
  const roleOptions: { value: PlmnRole; label: string }[] = [
    { value: "primary", label: t("reference.operator.plmn.roles.primary") },
    { value: "secondary", label: t("reference.operator.plmn.roles.secondary") },
  ];
  let codeError: string | null = null;
  if (refusal !== null) codeError = refusal;
  else if (plmn !== null && owner !== null) codeError = getPlmnOwnerText(t, plmn, owner);
  else if (plmn !== null && isAlreadyAdded) codeError = t("reference.operator.plmn.dialog.alreadyAdded", { plmn: formatPlmn(plmn) });
  else if (entry.problem !== null && isCodeChecked) codeError = getPlmnProblemText(t, entry.problem, false);

  function updateDraft(changes: Partial<PlmnDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
    setRefusal(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (plmn === null || !canSubmit) return;
    onSubmit(listPlmnsWithSaved(ownPlmns, replacedPlmn, { plmn, role }), setRefusal);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="pr-7">
          {isEditing ? t("reference.operator.plmn.dialog.editTitle") : t("reference.operator.plmn.dialog.addTitle")}
        </DialogTitle>
        <DialogDescription>{t("reference.operator.plmn.dialog.description", { name: shownOperator.name })}</DialogDescription>
      </DialogHeader>
      <PlmnCodeFields
        mcc={draft.mcc}
        mnc={draft.mnc}
        error={codeError}
        isDisabled={isPending}
        onMccChange={(mcc) => updateDraft({ mcc })}
        onMncChange={(mnc) => updateDraft({ mnc })}
        onMncBlur={() => setIsCodeChecked(true)}
      />
      <Field>
        <FieldTitle id={roleTitleId}>{t("users.table.role")}</FieldTitle>
        <SegmentedControl
          value={role}
          options={roleOptions}
          onValueChange={(nextRole) => updateDraft({ role: nextRole })}
          ariaLabelledBy={roleTitleId}
          disabled={isPending}
          className={FULL_WIDTH_SEGMENTS_CLASS}
        />
        <FieldDescription>
          {role === "primary" && otherPrimary !== undefined
            ? t("reference.operator.plmn.dialog.primaryMoves", { plmn: formatPlmn(otherPrimary.plmn) })
            : t("reference.operator.plmn.dialog.roleHint")}
        </FieldDescription>
      </Field>
      <DialogFormFooter
        submitLabel={isEditing ? t("common:actions.saveChanges") : t("reference.operator.plmn.add")}
        canSubmit={canSubmit}
        isPending={isPending}
        onCancel={onCancel}
      />
    </form>
  );
}

export function OperatorPlmnDialog({ operator, editedPlmn, open, onOpenChange }: OperatorPlmnDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const openingCount = useOpeningCount(open);

  const saveMutation = useMutation({
    mutationFn: (plmns: PlmnInput[]) => updateOperator(operator.id, { plmns }),
    onSuccess: (updatedOperator) => {
      onOpenChange(false);
      storeUpdatedOperator(queryClient, updatedOperator);
      toast.success(editedPlmn === null ? t("reference.operator.plmn.dialog.added") : t("reference.operator.plmn.dialog.saved"));
    },
    onError: (error) => {
      if (!isConflict(error)) showReferenceError(error, SAVE_FAILED_KEY);
    },
  });

  function savePlmns(plmns: PlmnInput[], onRefused: (reason: string) => void) {
    saveMutation.mutate(plmns, {
      onError: (error) => {
        if (isConflict(error)) onRefused(getReferenceErrorMessage(t, error, SAVE_FAILED_KEY));
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
        <PlmnForm
          key={openingCount}
          operator={operator}
          editedPlmn={editedPlmn}
          isPending={saveMutation.isPending}
          onSubmit={savePlmns}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
