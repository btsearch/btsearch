import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { createOperator } from "../../api/operators";
import { invalidateOperators } from "../../api/queryKeys";
import type { OperatorCreate } from "../../types";
import { getReferenceErrorMessage, showReferenceError } from "../../utils/errors";
import { CountryChoiceLabel } from "../shared/choiceLabels";
import { DialogFormFooter } from "../shared/dialogFormFooter";
import { useOpeningCount } from "../shared/useOpeningCount";
import {
  OPERATOR_LEGAL_NAME_MAX_LENGTH,
  OPERATOR_NAME_MAX_LENGTH,
  OPERATOR_SHORT_CODE_MAX_LENGTH,
  OperatorBrandSelect,
  OperatorCountryLock,
  PlmnCodeFields,
  getPlmnOwnerText,
  getPlmnProblemText,
} from "./operatorFields";
import { findPlmnOwner, readPlmnEntry } from "./operatorPlmns";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlineError } from "@/components/ui/error-state";
import { Field, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { listCountryOptions } from "@/features/admin/users/utils/grants";
import { countriesQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import { isConflict } from "@/lib/api";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

type OperatorCreateDraft = {
  countryCode: string | null;
  brandId: number | null;
  name: string;
  shortCode: string;
  legalName: string;
  mcc: string;
  mnc: string;
};

type OperatorCreateFormProps = {
  lockedCountryCode?: string;
  defaultCountryCode?: string;
  isPending: boolean;
  onSubmit: (operator: OperatorCreate, onRefused: (reason: string) => void) => void;
  onCancel: () => void;
};

type OperatorCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  countryCode?: string;
  defaultCountryCode?: string;
};

const CREATE_FAILED_KEY = "admin:reference.operator.create.failed";
const FIELD_PAIR_CLASS = "grid gap-4 sm:grid-cols-2 sm:gap-3";
const EMPTY_DRAFT: OperatorCreateDraft = { countryCode: null, brandId: null, name: "", shortCode: "", legalName: "", mcc: "", mnc: "" };

function OperatorCreateForm({ lockedCountryCode, defaultCountryCode, isPending, onSubmit, onCancel }: OperatorCreateFormProps) {
  const { t, i18n } = useTranslation("admin");
  const countryTitleId = useId();
  const brandTitleId = useId();
  const nameId = useId();
  const shortCodeId = useId();
  const legalNameId = useId();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [isCodeChecked, setIsCodeChecked] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const {
    data: countries,
    isError: hasCountriesLoadFailed,
    isFetching: isFetchingCountries,
    refetch: refetchCountries,
  } = useQuery({ ...countriesQueryOptions(), enabled: lockedCountryCode === undefined });
  const { data: operators } = useQuery(operatorsQueryOptions());

  const countryOptions = listCountryOptions(countries ?? [], i18n.language);
  const pickedCountry = countryOptions.find((country) => country.code === draft.countryCode);
  const defaultCountry =
    countryOptions.find((country) => country.code === defaultCountryCode) ?? (countryOptions.length === 1 ? countryOptions[0] : undefined);
  const countryCode = lockedCountryCode ?? pickedCountry?.code ?? defaultCountry?.code ?? null;
  const name = draft.name.trim();
  const legalName = draft.legalName.trim();
  const shortCode = draft.shortCode.trim();
  const plmnEntry = readPlmnEntry(draft.mcc, draft.mnc);
  const plmn = plmnEntry.plmn;
  const plmnOwner = findPlmnOwner(operators, plmn, null);
  const canSubmit = countryCode !== null && name !== "" && legalName !== "" && plmnEntry.problem === null && plmnOwner === null && !isPending;
  let plmnError: string | null = null;
  if (plmn !== null && plmnOwner !== null) plmnError = getPlmnOwnerText(t, plmn, plmnOwner);
  else if (plmnEntry.problem !== null && isCodeChecked) plmnError = getPlmnProblemText(t, plmnEntry.problem, true);

  function updateDraft(changes: Partial<OperatorCreateDraft>) {
    setDraft((current) => ({ ...current, ...changes }));
    setRefusal(null);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (countryCode === null || !canSubmit) return;

    onSubmit(
      {
        countryCode,
        brandId: draft.brandId,
        name,
        legalName,
        shortCode: shortCode === "" ? null : shortCode,
        plmns: plmn === null ? [] : [{ plmn, role: "primary" }],
      },
      setRefusal,
    );
  }

  let countryControl: ReactNode;
  if (lockedCountryCode !== undefined) {
    countryControl = <OperatorCountryLock labelId={countryTitleId} countryCode={lockedCountryCode} />;
  } else if (countries !== undefined) {
    countryControl = (
      <Select value={countryCode} onValueChange={(code) => updateDraft({ countryCode: code })} disabled={isPending}>
        <SelectTrigger aria-labelledby={countryTitleId} className="w-full cursor-pointer">
          <SelectValue placeholder={t("users.detail.grants.dialog.countryPlaceholder")}>
            {countryCode === null ? null : <CountryChoiceLabel countryCode={countryCode} />}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {countryOptions.map((country) => (
            <SelectItem key={country.code} value={country.code} className="cursor-pointer">
              <CountryChoiceLabel countryCode={country.code} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  } else if (hasCountriesLoadFailed) {
    countryControl = (
      <InlineError
        size="sm"
        title={t("users.detail.grants.dialog.countriesLoadFailed")}
        onRetry={() => void refetchCountries()}
        isRetrying={isFetchingCountries}
      />
    );
  } else {
    countryControl = <Skeleton className="h-8 w-full rounded-lg" />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle className="pr-7">{t("reference.operators.add")}</DialogTitle>
        <DialogDescription>{t("reference.operator.create.description")}</DialogDescription>
      </DialogHeader>
      {refusal === null ? null : <InlineError title={refusal} />}
      <div className={FIELD_PAIR_CLASS}>
        <Field>
          <FieldTitle id={countryTitleId}>{t("users.detail.grants.dialog.country")}</FieldTitle>
          {countryControl}
          <FieldDescription>{t("reference.operator.create.countryHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldTitle id={brandTitleId}>{t("reference.operator.fields.brand")}</FieldTitle>
          <OperatorBrandSelect
            labelId={brandTitleId}
            brandId={draft.brandId}
            isDisabled={isPending}
            onBrandIdChange={(brandId) => updateDraft({ brandId })}
          />
        </Field>
      </div>
      <div className={FIELD_PAIR_CLASS}>
        <Field>
          <FieldLabel htmlFor={nameId}>{t("common:labels.name")}</FieldLabel>
          <Input
            {...NO_AUTOFILL_PROPS}
            id={nameId}
            value={draft.name}
            onChange={(event) => updateDraft({ name: event.target.value })}
            maxLength={OPERATOR_NAME_MAX_LENGTH}
            disabled={isPending}
            required
          />
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
          <FieldDescription>{t("reference.operator.create.shortCodeHint")}</FieldDescription>
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor={legalNameId}>{t("reference.operator.fields.legalName")}</FieldLabel>
        <Input
          {...NO_AUTOFILL_PROPS}
          id={legalNameId}
          value={draft.legalName}
          onChange={(event) => updateDraft({ legalName: event.target.value })}
          maxLength={OPERATOR_LEGAL_NAME_MAX_LENGTH}
          disabled={isPending}
          required
        />
      </Field>
      <PlmnCodeFields
        mcc={draft.mcc}
        mnc={draft.mnc}
        error={plmnError}
        isDisabled={isPending}
        onMccChange={(mcc) => updateDraft({ mcc })}
        onMncChange={(mnc) => updateDraft({ mnc })}
        onMncBlur={() => setIsCodeChecked(true)}
      />
      <DialogFormFooter submitLabel={t("reference.operators.add")} canSubmit={canSubmit} isPending={isPending} onCancel={onCancel} />
    </form>
  );
}

export function OperatorCreateDialog({ open, onOpenChange, countryCode, defaultCountryCode }: OperatorCreateDialogProps) {
  const { t } = useTranslation("admin");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const openingCount = useOpeningCount(open);

  const createMutation = useMutation({
    mutationFn: (operator: OperatorCreate) => createOperator(operator),
    onSuccess: (createdOperator) => {
      onOpenChange(false);
      void invalidateOperators(queryClient);
      toast.success(t("reference.operator.create.success"));
      void navigate({ to: "/admin/operators/$id", params: { id: String(createdOperator.id) } });
    },
    onError: (error) => {
      if (!isConflict(error)) showReferenceError(error, CREATE_FAILED_KEY);
    },
  });

  function submitOperator(operator: OperatorCreate, onRefused: (reason: string) => void) {
    createMutation.mutate(operator, {
      onError: (error) => {
        if (isConflict(error)) onRefused(getReferenceErrorMessage(t, error, CREATE_FAILED_KEY));
      },
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!createMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <OperatorCreateForm
          key={openingCount}
          lockedCountryCode={countryCode}
          defaultCountryCode={defaultCountryCode}
          isPending={createMutation.isPending}
          onSubmit={submitOperator}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
