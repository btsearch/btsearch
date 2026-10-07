import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type KeyboardEvent, type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { invalidateStructureOwners } from "../../api/queryKeys";
import { createStructureOwner, structureOwnersQueryOptions, updateStructureOwner } from "../../api/structureOwners";
import type { Brand, Country, Operator, StructureOwner, StructureOwnerCreate, StructureOwnerUpdate } from "../../types";
import { hasChanges, pickChanges } from "../../utils/diff";
import { showReferenceError } from "../../utils/errors";
import { BrandChoiceLabel, CountryChoiceLabel, MarkedChoiceLabel } from "../shared/choiceLabels";
import { DialogFormFooter } from "../shared/dialogFormFooter";
import { useOpeningCount } from "../shared/useOpeningCount";
import type { BrandLook } from "@/components/cellular/brandMark";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlineError } from "@/components/ui/error-state";
import { Field, FieldDescription, FieldError, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { listCountryOptions } from "@/features/admin/users/utils/grants";
import { brandsQueryOptions, countriesQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { getCountryName } from "@/lib/geo/countryName";

type StructureOwnerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  owner?: StructureOwner;
  defaultCountryCode?: string;
  initialName?: string;
  lockedCountryCode?: string;
  onCreated?: (owner: StructureOwner) => void;
};

type StructureOwnerValues = {
  name: string;
  countryCode: string | null;
  brandId: number | null;
  operatorId: number | null;
};

type StructureOwnerSave = { kind: "create"; body: StructureOwnerCreate } | { kind: "update"; id: number; changes: StructureOwnerUpdate };

type StructureOwnerFormProps = {
  owner?: StructureOwner;
  defaultCountryCode?: string;
  initialName?: string;
  isPending: boolean;
  onSubmit: (save: StructureOwnerSave) => void;
  onCancel: () => void;
};

type OwnerNameFormProps = {
  title: string;
  description: string;
  hint?: string;
  submitLabel: string;
  initialName?: string;
  isPending?: boolean;
  onSubmit: (name: string) => void;
  onCancel: () => void;
};

type ChoiceFieldProps = {
  titleId: string;
  title: string;
  hint?: string;
  isLoaded: boolean;
  hasLoadFailed: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  children: ReactNode;
};

const NAME_MAX_LENGTH = 100;
const NO_CHOICE = "_none";
const OWNER_VALUE_KEYS = ["name", "countryCode", "brandId", "operatorId"] as const satisfies readonly (keyof StructureOwnerValues)[];
const NO_COUNTRIES: Country[] = [];
const NO_BRANDS: Brand[] = [];
const NO_OPERATORS: Operator[] = [];
const NO_OWNERS: StructureOwner[] = [];

function toOwnerValues(owner: StructureOwner | undefined, defaultCountryCode: string | undefined): StructureOwnerValues {
  if (owner === undefined) return { name: "", countryCode: defaultCountryCode ?? null, brandId: null, operatorId: null };
  return { name: owner.name, countryCode: owner.countryCode, brandId: owner.brandId, operatorId: owner.operatorId };
}

function toInitialDraft(baseline: StructureOwnerValues, owner: StructureOwner | undefined, initialName: string | undefined): StructureOwnerValues {
  if (owner !== undefined || initialName === undefined) return baseline;
  return { ...baseline, name: initialName };
}

function readChoice(value: string | null): string | null {
  return value === null || value === NO_CHOICE ? null : value;
}

function readIdChoice(value: string | null): number | null {
  const choice = readChoice(value);
  return choice === null ? null : Number(choice);
}

function saveStructureOwner(save: StructureOwnerSave): Promise<StructureOwner> {
  return save.kind === "create" ? createStructureOwner(save.body) : updateStructureOwner(save.id, save.changes);
}

function keepEnterInside(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key === "Enter") event.stopPropagation();
}

function ChoiceField({ titleId, title, hint, isLoaded, hasLoadFailed, isRetrying, onRetry, children }: ChoiceFieldProps) {
  const { t } = useTranslation("admin");

  let control: ReactNode;
  if (isLoaded) {
    control = children;
  } else if (hasLoadFailed) {
    control = <InlineError size="sm" title={t("reference.owners.dialog.choicesLoadFailed")} onRetry={onRetry} isRetrying={isRetrying} />;
  } else {
    control = <Skeleton className="h-8 w-full rounded-lg" />;
  }

  return (
    <Field>
      <FieldTitle id={titleId}>{title}</FieldTitle>
      {control}
      {hint === undefined ? null : <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

function StructureOwnerForm({ owner, defaultCountryCode, initialName, isPending, onSubmit, onCancel }: StructureOwnerFormProps) {
  const { t, i18n } = useTranslation("admin");
  const nameId = useId();
  const countryTitleId = useId();
  const brandTitleId = useId();
  const operatorTitleId = useId();
  const [editedOwner] = useState(owner);
  const [baseline] = useState(() => toOwnerValues(editedOwner, defaultCountryCode));
  const [draft, setDraft] = useState(() => toInitialDraft(baseline, editedOwner, initialName));
  const countriesQuery = useQuery(countriesQueryOptions());
  const brandsQuery = useQuery(brandsQueryOptions());
  const operatorsQuery = useQuery(operatorsQueryOptions());
  const ownersQuery = useQuery(structureOwnersQueryOptions());

  const isEditing = editedOwner !== undefined;
  const brands = brandsQuery.data ?? NO_BRANDS;
  const operators = operatorsQuery.data ?? NO_OPERATORS;
  const brandById = new Map(brands.map((brand) => [brand.id, brand]));
  const operatorById = new Map(operators.map((operator) => [operator.id, operator]));
  const countryOptions = listCountryOptions(countriesQuery.data ?? NO_COUNTRIES, i18n.language);
  const countryOperators = operators.filter((operator) => draft.countryCode === null || operator.countryCode === draft.countryCode);
  const otherOwners = (ownersQuery.data ?? NO_OWNERS).filter((other) => other.id !== editedOwner?.id);
  const takenOperatorIds = new Set(otherOwners.map((other) => other.operatorId));
  const selectedBrand = draft.brandId === null ? undefined : brandById.get(draft.brandId);
  const selectedOperator = draft.operatorId === null ? undefined : operatorById.get(draft.operatorId);
  const values: StructureOwnerValues = { ...draft, name: draft.name.trim() };
  const changes = pickChanges(baseline, values, OWNER_VALUE_KEYS);
  const nameError = isEditing && values.name === "" ? t("common:validation.required") : null;
  const canSubmit = values.name !== "" && !isPending && (!isEditing || hasChanges(changes));

  function getOperatorLook(operator: Operator): BrandLook | null {
    return operator.brandId === null ? null : (brandById.get(operator.brandId) ?? null);
  }

  function changeCountry(countryCode: string | null) {
    setDraft((current) => {
      const operator = current.operatorId === null ? undefined : operatorById.get(current.operatorId);
      const isOperatorKept = countryCode === null || operator === undefined || operator.countryCode === countryCode;
      return { ...current, countryCode, operatorId: isOperatorKept ? current.operatorId : null };
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!canSubmit) return;
    if (editedOwner === undefined) onSubmit({ kind: "create", body: values });
    else onSubmit({ kind: "update", id: editedOwner.id, changes });
  }

  return (
    <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
      <DialogHeader className="pr-7">
        <DialogTitle>{isEditing ? t("reference.owners.dialog.editTitle") : t("reference.owners.dialog.addTitle")}</DialogTitle>
        <DialogDescription>
          {isEditing ? t("reference.owners.dialog.editDescription") : t("reference.owners.dialog.addDescription")}
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={nameError !== null || undefined}>
        <FieldLabel htmlFor={nameId}>{t("common:labels.name")}</FieldLabel>
        <Input
          {...NO_AUTOFILL_PROPS}
          id={nameId}
          value={draft.name}
          onChange={(event) => {
            const name = event.target.value;
            setDraft((current) => ({ ...current, name }));
          }}
          maxLength={NAME_MAX_LENGTH}
          disabled={isPending}
          aria-invalid={nameError !== null || undefined}
        />
        {nameError === null ? null : <FieldError>{nameError}</FieldError>}
      </Field>
      <ChoiceField
        titleId={countryTitleId}
        title={t("users.detail.grants.dialog.country")}
        hint={t("reference.owners.dialog.countryHint")}
        isLoaded={countriesQuery.data !== undefined}
        hasLoadFailed={countriesQuery.isError}
        isRetrying={countriesQuery.isFetching}
        onRetry={() => void countriesQuery.refetch()}
      >
        <Select value={draft.countryCode ?? NO_CHOICE} onValueChange={(value) => changeCountry(readChoice(value))} disabled={isPending}>
          <SelectTrigger aria-labelledby={countryTitleId} className="w-full cursor-pointer">
            <SelectValue>
              {draft.countryCode === null ? (
                <span className="text-muted-foreground">{t("reference.owners.noCountry")}</span>
              ) : (
                <CountryChoiceLabel countryCode={draft.countryCode} />
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_CHOICE} className="cursor-pointer">
              {t("reference.owners.noCountry")}
            </SelectItem>
            {countryOptions.map((country) => (
              <SelectItem key={country.code} value={country.code} className="cursor-pointer">
                <CountryChoiceLabel countryCode={country.code} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ChoiceField>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <ChoiceField
          titleId={brandTitleId}
          title={t("reference.brands.brand")}
          isLoaded={brandsQuery.data !== undefined}
          hasLoadFailed={brandsQuery.isError}
          isRetrying={brandsQuery.isFetching}
          onRetry={() => void brandsQuery.refetch()}
        >
          <Select
            value={draft.brandId === null ? NO_CHOICE : String(draft.brandId)}
            onValueChange={(value) => {
              const brandId = readIdChoice(value);
              setDraft((current) => ({ ...current, brandId }));
            }}
            disabled={isPending}
          >
            <SelectTrigger aria-labelledby={brandTitleId} className="w-full cursor-pointer">
              <SelectValue>
                {selectedBrand === undefined ? (
                  <span className="text-muted-foreground">
                    <BrandChoiceLabel brand={null} />
                  </span>
                ) : (
                  <BrandChoiceLabel brand={selectedBrand} />
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-56">
              <SelectItem value={NO_CHOICE} className="cursor-pointer">
                <BrandChoiceLabel brand={null} />
              </SelectItem>
              {brands.map((brand) => (
                <SelectItem key={brand.id} value={String(brand.id)} className="cursor-pointer">
                  <BrandChoiceLabel brand={brand} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ChoiceField>
        <ChoiceField
          titleId={operatorTitleId}
          title={t("common:labels.operator")}
          hint={t("reference.owners.dialog.operatorHint")}
          isLoaded={operatorsQuery.data !== undefined}
          hasLoadFailed={operatorsQuery.isError}
          isRetrying={operatorsQuery.isFetching}
          onRetry={() => void operatorsQuery.refetch()}
        >
          <Select
            value={draft.operatorId === null ? NO_CHOICE : String(draft.operatorId)}
            onValueChange={(value) => {
              const operatorId = readIdChoice(value);
              setDraft((current) => ({ ...current, operatorId }));
            }}
            disabled={isPending}
          >
            <SelectTrigger aria-labelledby={operatorTitleId} className="w-full cursor-pointer">
              <SelectValue>
                {selectedOperator === undefined ? (
                  <span className="text-muted-foreground">{t("reference.owners.notAnOperator")}</span>
                ) : (
                  <MarkedChoiceLabel look={getOperatorLook(selectedOperator)} name={selectedOperator.name} />
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="min-w-64">
              <SelectItem value={NO_CHOICE} className="cursor-pointer">
                {t("reference.owners.notAnOperator")}
              </SelectItem>
              {countryOperators.map((operator) => {
                const isTaken = takenOperatorIds.has(operator.id);

                return (
                  <SelectItem key={operator.id} value={String(operator.id)} disabled={isTaken} className="cursor-pointer">
                    <MarkedChoiceLabel look={getOperatorLook(operator)} name={operator.name} />
                    {draft.countryCode === null ? <CountryCodeTile code={operator.countryCode} size="xs" /> : null}
                    {isTaken ? <span className="text-muted-foreground">{t("reference.owners.dialog.operatorTaken")}</span> : null}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </ChoiceField>
      </div>
      <DialogFormFooter
        submitLabel={isEditing ? t("common:actions.saveChanges") : t("reference.owners.add")}
        canSubmit={canSubmit}
        isPending={isPending}
        onCancel={onCancel}
      />
    </form>
  );
}

export function OwnerNameForm({
  title,
  description,
  hint,
  submitLabel,
  initialName = "",
  isPending = false,
  onSubmit,
  onCancel,
}: OwnerNameFormProps) {
  const { t } = useTranslation();
  const nameId = useId();
  const [name, setName] = useState(initialName);
  const trimmedName = name.trim();
  const canSubmit = trimmedName !== "" && !isPending;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (canSubmit) onSubmit(trimmedName);
  }

  return (
    <form onSubmit={handleSubmit} onKeyDown={keepEnterInside} className="flex min-w-0 flex-col gap-4">
      <DialogHeader className="pr-7">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor={nameId}>{t("common:labels.name")}</FieldLabel>
        <Input
          {...NO_AUTOFILL_PROPS}
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={NAME_MAX_LENGTH}
          disabled={isPending}
        />
        {hint === undefined ? null : <FieldDescription>{hint}</FieldDescription>}
      </Field>
      <DialogFormFooter submitLabel={submitLabel} canSubmit={canSubmit} isPending={isPending} onCancel={onCancel} />
    </form>
  );
}

export function StructureOwnerDialog({
  open,
  onOpenChange,
  owner,
  defaultCountryCode,
  initialName,
  lockedCountryCode,
  onCreated,
}: StructureOwnerDialogProps) {
  const { t, i18n } = useTranslation("admin");
  const queryClient = useQueryClient();
  const openingCount = useOpeningCount(open);

  const saveMutation = useMutation({
    mutationFn: saveStructureOwner,
    onSuccess: (savedOwner, save) => {
      onOpenChange(false);
      void invalidateStructureOwners(queryClient);
      toast.success(save.kind === "create" ? t("reference.owners.toasts.created") : t("reference.owners.toasts.saved"));
      if (save.kind === "create") onCreated?.(savedOwner);
    },
    onError: (error, save) => {
      showReferenceError(error, save.kind === "create" ? "admin:reference.owners.errors.createFailed" : "admin:reference.owners.errors.saveFailed");
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saveMutation.isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        {lockedCountryCode === undefined || owner !== undefined ? (
          <StructureOwnerForm
            key={openingCount}
            owner={owner}
            defaultCountryCode={defaultCountryCode}
            initialName={initialName}
            isPending={saveMutation.isPending}
            onSubmit={(save) => saveMutation.mutate(save)}
            onCancel={() => onOpenChange(false)}
          />
        ) : (
          <OwnerNameForm
            key={openingCount}
            title={t("reference.owners.dialog.addTitle")}
            description={t("reference.owners.dialog.addForCountryDescription", { country: getCountryName(lockedCountryCode, i18n.language) })}
            hint={t("reference.owners.dialog.adminFieldsHint")}
            submitLabel={t("reference.owners.add")}
            initialName={initialName}
            isPending={saveMutation.isPending}
            onSubmit={(name) => saveMutation.mutate({ kind: "create", body: { name, countryCode: lockedCountryCode } })}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
