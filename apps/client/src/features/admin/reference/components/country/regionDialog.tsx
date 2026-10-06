import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { invalidateRegions } from "../../api/queryKeys";
import { createRegion, updateRegion } from "../../api/regions";
import type { Country, Region } from "../../types";
import { hasChanges, pickChanges } from "../../utils/diff";
import { getReferenceErrorMessage, showReferenceError } from "../../utils/errors";
import { DialogFormFooter } from "../shared/dialogFormFooter";
import { DialogNote } from "../shared/referenceCards";
import { useOpeningCount } from "../shared/useOpeningCount";
import { MONO_INPUT_CLASS } from "../shared/values";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InlineError } from "@/components/ui/error-state";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { isConflict } from "@/lib/api";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type RegionFields = Pick<Region, "name" | "code" | "isoCode">;

type RegionDialogProps = {
  country: Country;
  region: Region | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type RegionFormProps = {
  country: Country;
  region: Region | null;
  isPending: boolean;
  onSubmit: (fields: RegionFields, onRefused: (reason: string) => void) => void;
  onCancel: () => void;
};

const NAME_MAX_LENGTH = 100;
const CODE_MAX_LENGTH = 3;
const ISO_REST_PATTERN = /^[A-Z0-9]{1,3}$/;
const REGION_FIELD_KEYS = ["name", "code", "isoCode"] as const;
const SAVE_FAILED_KEY = "admin:reference.country.regions.dialog.saveFailed";

function toRegionFields(region: Region): RegionFields {
  return { name: region.name, code: region.code, isoCode: region.isoCode };
}

function toIsoPrefix(countryCode: string): string {
  return `${countryCode}-`;
}

function toIsoRest(isoCode: string | null, isoPrefix: string): string {
  if (isoCode === null) return "";
  return isoCode.startsWith(isoPrefix) ? isoCode.slice(isoPrefix.length) : isoCode;
}

function normalizeIsoRest(text: string, isoPrefix: string): string {
  const upperCaseText = text.trim().toUpperCase();
  return upperCaseText.startsWith(isoPrefix) ? upperCaseText.slice(isoPrefix.length) : upperCaseText;
}

function RegionForm({ country, region, isPending, onSubmit, onCancel }: RegionFormProps) {
  const { t, i18n } = useTranslation("admin");
  const nameId = useId();
  const codeId = useId();
  const codeHintId = useId();
  const isoId = useId();
  const isoPrefixId = useId();
  const isoHintId = useId();
  const [name, setName] = useState(region?.name ?? "");
  const [code, setCode] = useState(region?.code ?? "");
  const [isoRest, setIsoRest] = useState(() => toIsoRest(region?.isoCode ?? null, toIsoPrefix(country.code)));
  const [refusal, setRefusal] = useState<string | null>(null);

  const isoPrefix = toIsoPrefix(country.code);
  const fields: RegionFields = {
    name: name.trim(),
    code: code.trim(),
    isoCode: isoRest === "" ? null : `${isoPrefix}${isoRest}`,
  };
  const isNameValid = fields.name.length >= 1 && fields.name.length <= NAME_MAX_LENGTH;
  const isCodeValid = fields.code.length >= 1 && fields.code.length <= CODE_MAX_LENGTH;
  const isIsoRestValid = isoRest === "" || ISO_REST_PATTERN.test(isoRest);
  const isChanged = region === null || hasChanges(pickChanges(toRegionFields(region), fields, REGION_FIELD_KEYS));
  const canSubmit = isNameValid && isCodeValid && isIsoRestValid && isChanged && !isPending;
  const countryName = getCountryName(country.code, i18n.language);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canSubmit) onSubmit(fields, setRefusal);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{region === null ? t("reference.country.regions.add") : t("reference.country.regions.dialog.editTitle")}</DialogTitle>
        <DialogDescription>
          {region === null
            ? t("reference.country.regions.dialog.addDescription", { country: countryName })
            : t("reference.country.regions.dialog.editDescription", { country: countryName })}
        </DialogDescription>
      </DialogHeader>
      {refusal === null ? null : <InlineError title={refusal} />}
      <Field>
        <FieldLabel htmlFor={nameId}>{t("common:labels.name")}</FieldLabel>
        <Input
          {...NO_AUTOFILL_PROPS}
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={NAME_MAX_LENGTH}
          disabled={isPending}
          required
        />
      </Field>
      <div className="grid grid-cols-2 items-start gap-3">
        <Field>
          <FieldLabel htmlFor={codeId}>{t("reference.country.regions.columns.code")}</FieldLabel>
          <Input
            {...NO_AUTOFILL_PROPS}
            id={codeId}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            spellCheck={false}
            maxLength={CODE_MAX_LENGTH}
            disabled={isPending}
            required
            aria-describedby={codeHintId}
            className={MONO_INPUT_CLASS}
          />
          <FieldDescription id={codeHintId}>{t("reference.country.regions.dialog.codeHint")}</FieldDescription>
        </Field>
        <Field data-invalid={!isIsoRestValid || undefined}>
          <FieldLabel htmlFor={isoId}>{t("reference.country.regions.columns.isoCode")}</FieldLabel>
          <InputGroup>
            <InputGroupAddon id={isoPrefixId} className="pl-2.5">
              <InputGroupText className={cn(MONO_INPUT_CLASS, "text-base font-normal")}>{isoPrefix}</InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              {...NO_AUTOFILL_PROPS}
              id={isoId}
              value={isoRest}
              onChange={(event) => setIsoRest(normalizeIsoRest(event.target.value, isoPrefix))}
              autoCapitalize="characters"
              spellCheck={false}
              disabled={isPending}
              aria-invalid={!isIsoRestValid || undefined}
              aria-describedby={`${isoPrefixId} ${isoHintId}`}
              className={cn(MONO_INPUT_CLASS, "pl-px!")}
            />
          </InputGroup>
          {isIsoRestValid ? (
            <FieldDescription id={isoHintId}>{t("reference.country.regions.dialog.isoCodeHint")}</FieldDescription>
          ) : (
            <FieldError id={isoHintId}>{t("reference.country.regions.dialog.isoCodeInvalid")}</FieldError>
          )}
        </Field>
      </div>
      <DialogNote>{t("reference.country.regions.dialog.isoCodeNote")}</DialogNote>
      <DialogFormFooter
        submitLabel={region === null ? t("reference.country.regions.add") : t("common:actions.saveChanges")}
        canSubmit={canSubmit}
        isPending={isPending}
        onCancel={onCancel}
      />
    </form>
  );
}

export function RegionDialog({ country, region, open, onOpenChange }: RegionDialogProps) {
  const { t } = useTranslation("admin");
  const queryClient = useQueryClient();
  const openingCount = useOpeningCount(open);

  const saveMutation = useMutation({
    mutationFn: (fields: RegionFields) => {
      if (region === null) return createRegion({ countryCode: country.code, ...fields });
      return updateRegion(region.id, pickChanges(toRegionFields(region), fields, REGION_FIELD_KEYS));
    },
    onSuccess: () => {
      onOpenChange(false);
      void invalidateRegions(queryClient);
      toast.success(region === null ? t("reference.country.regions.dialog.addSuccess") : t("reference.country.regions.dialog.saveSuccess"));
    },
    onError: (error) => {
      if (!isConflict(error)) showReferenceError(error, SAVE_FAILED_KEY);
    },
  });

  function saveRegion(fields: RegionFields, onRefused: (reason: string) => void) {
    saveMutation.mutate(fields, {
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
      <DialogContent className="sm:max-w-md">
        <RegionForm
          key={openingCount}
          country={country}
          region={region}
          isPending={saveMutation.isPending}
          onSubmit={saveRegion}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
