import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { updateOperator } from "../../api/operators";
import type { Operator, OperatorUpdate } from "../../types";
import { hasChanges, pickChanges } from "../../utils/diff";
import { getReferenceErrorMessage, showReferenceError } from "../../utils/errors";
import { ReferenceCard, ReferenceCardFooter, ReferenceCardHeader } from "../shared/referenceCards";
import { storeUpdatedOperator } from "./operatorCache";
import {
  OPERATOR_LEGAL_NAME_MAX_LENGTH,
  OPERATOR_NAME_MAX_LENGTH,
  OPERATOR_SHORT_CODE_MAX_LENGTH,
  OperatorBrandSelect,
  OperatorCountryLock,
} from "./operatorFields";
import { keepDigits } from "./operatorPlmns";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { isConflict } from "@/lib/api";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

type OperatorDetails = Pick<Operator, "name" | "legalName" | "shortCode" | "brandId" | "sortPriority">;

type OperatorDetailsDraft = {
  name: string;
  legalName: string;
  shortCode: string;
  brandId: number | null;
  listPosition: string;
};

type NameRefusal = {
  name: string;
  reason: string;
};

const DETAIL_KEYS = ["name", "legalName", "shortCode", "brandId", "sortPriority"] as const;
const LIST_POSITION_MIN = 1;
const LIST_POSITION_MAX = 1000;
const LIST_POSITION_MAX_LENGTH = 4;
const SAVE_FAILED_KEY = "admin:reference.operator.details.saveFailed";
const FIELD_GRID_CLASS = "grid grid-cols-[repeat(auto-fit,minmax(min(100%,22.5rem),1fr))] gap-4";

function toDetailsDraft(details: OperatorDetails): OperatorDetailsDraft {
  return {
    name: details.name,
    legalName: details.legalName,
    shortCode: details.shortCode ?? "",
    brandId: details.brandId,
    listPosition: details.sortPriority === null ? "" : String(details.sortPriority),
  };
}

function readDraftDetails(draft: OperatorDetailsDraft): OperatorDetails {
  const shortCode = draft.shortCode.trim();

  return {
    name: draft.name.trim(),
    legalName: draft.legalName.trim(),
    shortCode: shortCode === "" ? null : shortCode,
    brandId: draft.brandId,
    sortPriority: draft.listPosition === "" ? null : Number(draft.listPosition),
  };
}

function isListPosition(sortPriority: number | null): boolean {
  return sortPriority === null || (sortPriority >= LIST_POSITION_MIN && sortPriority <= LIST_POSITION_MAX);
}

export function OperatorDetailsCard({ operator }: { operator: Operator }) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const formId = useId();
  const nameId = useId();
  const legalNameId = useId();
  const shortCodeId = useId();
  const brandTitleId = useId();
  const countryTitleId = useId();
  const listPositionId = useId();
  const [baseline, setBaseline] = useState(() => toDetailsDraft(operator));
  const [draft, setDraft] = useState(baseline);
  const [nameRefusal, setNameRefusal] = useState<NameRefusal | null>(null);

  const saveMutation = useMutation({
    mutationFn: (changes: OperatorUpdate) => updateOperator(operator.id, changes),
    onSuccess: (updatedOperator) => {
      const savedDraft = toDetailsDraft(updatedOperator);
      setBaseline(savedDraft);
      setDraft(savedDraft);
      storeUpdatedOperator(queryClient, updatedOperator);
      toast.success(t("reference.operator.details.saved"));
    },
    onError: (error, changes) => {
      if (isConflict(error) && changes.name !== undefined) {
        setNameRefusal({ name: changes.name, reason: getReferenceErrorMessage(t, error, SAVE_FAILED_KEY) });
        return;
      }
      showReferenceError(error, SAVE_FAILED_KEY);
    },
  });

  function updateDraft(changes: Partial<OperatorDetailsDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
  }

  const details = readDraftDetails(draft);
  const changes = pickChanges(readDraftDetails(baseline), details, DETAIL_KEYS);
  const isDirty = hasChanges(changes);
  const isPending = saveMutation.isPending;
  const requiredText = t("common:validation.required");
  let nameError: string | null = null;
  if (details.name === "") nameError = requiredText;
  else if (nameRefusal !== null && nameRefusal.name === details.name) nameError = nameRefusal.reason;
  const legalNameError = details.legalName === "" ? requiredText : null;
  const listPositionError = isListPosition(details.sortPriority) ? null : t("reference.operator.details.listPositionInvalid");
  const canSave = isDirty && nameError === null && legalNameError === null && listPositionError === null && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSave) saveMutation.mutate(changes);
  }

  return (
    <ReferenceCard>
      <ReferenceCardHeader title={t("reference.operator.details.title")} description={t("reference.operator.details.description")} />
      <div className="border-t px-4 py-5 sm:px-5">
        <form id={formId} onSubmit={handleSubmit} className={FIELD_GRID_CLASS}>
          <Field data-invalid={nameError !== null || undefined}>
            <FieldLabel htmlFor={nameId}>{t("common:labels.name")}</FieldLabel>
            <Input
              {...NO_AUTOFILL_PROPS}
              id={nameId}
              value={draft.name}
              onChange={(event) => updateDraft({ name: event.target.value })}
              maxLength={OPERATOR_NAME_MAX_LENGTH}
              disabled={isPending}
              aria-invalid={nameError !== null || undefined}
            />
            {nameError === null ? (
              <FieldDescription>{t("reference.operator.details.nameHint")}</FieldDescription>
            ) : (
              <FieldError>{nameError}</FieldError>
            )}
          </Field>
          <Field data-invalid={legalNameError !== null || undefined}>
            <FieldLabel htmlFor={legalNameId}>{t("reference.operator.fields.legalName")}</FieldLabel>
            <Input
              {...NO_AUTOFILL_PROPS}
              id={legalNameId}
              value={draft.legalName}
              onChange={(event) => updateDraft({ legalName: event.target.value })}
              maxLength={OPERATOR_LEGAL_NAME_MAX_LENGTH}
              disabled={isPending}
              aria-invalid={legalNameError !== null || undefined}
            />
            {legalNameError === null ? null : <FieldError>{legalNameError}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor={shortCodeId}>{t("reference.operator.fields.shortCode")}</FieldLabel>
            <Input
              {...NO_AUTOFILL_PROPS}
              id={shortCodeId}
              value={draft.shortCode}
              onChange={(event) => updateDraft({ shortCode: event.target.value })}
              maxLength={OPERATOR_SHORT_CODE_MAX_LENGTH}
              spellCheck={false}
              disabled={isPending}
              className="font-mono"
            />
            <FieldDescription>{t("reference.operator.details.shortCodeHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldTitle id={brandTitleId}>{t("reference.operator.fields.brand")}</FieldTitle>
            <OperatorBrandSelect
              labelId={brandTitleId}
              brandId={draft.brandId}
              isDisabled={isPending}
              onBrandIdChange={(brandId) => updateDraft({ brandId })}
            />
            <FieldDescription>{t("reference.operator.details.brandHint")}</FieldDescription>
          </Field>
          <Field>
            <FieldTitle id={countryTitleId}>{t("users.detail.grants.dialog.country")}</FieldTitle>
            <OperatorCountryLock labelId={countryTitleId} countryCode={operator.countryCode} />
            <FieldDescription>{t("reference.operator.details.countryHint")}</FieldDescription>
          </Field>
          <Field data-invalid={listPositionError !== null || undefined}>
            <FieldLabel htmlFor={listPositionId}>{t("reference.operator.fields.listPosition")}</FieldLabel>
            <Input
              {...NO_AUTOFILL_PROPS}
              id={listPositionId}
              value={draft.listPosition}
              onChange={(event) => updateDraft({ listPosition: keepDigits(event.target.value) })}
              inputMode="numeric"
              maxLength={LIST_POSITION_MAX_LENGTH}
              disabled={isPending}
              aria-invalid={listPositionError !== null || undefined}
              className="font-mono"
            />
            {listPositionError === null ? (
              <FieldDescription>{t("reference.operator.details.listPositionHint")}</FieldDescription>
            ) : (
              <FieldError>{listPositionError}</FieldError>
            )}
          </Field>
        </form>
      </div>
      <ReferenceCardFooter className="mt-auto">
        <p className="text-xs text-muted-foreground">{isDirty ? t("users.detail.account.data.changedOnly") : t("common:actions.noChanges")}</p>
        <Button type="submit" form={formId} size="sm" className="cursor-pointer" disabled={!canSave}>
          {isPending ? <Spinner /> : null}
          {isPending ? t("common:actions.saving") : t("common:actions.saveChanges")}
        </Button>
      </ReferenceCardFooter>
    </ReferenceCard>
  );
}
