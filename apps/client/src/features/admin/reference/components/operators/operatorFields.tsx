import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import type { Operator } from "../../types";
import { MCC_LENGTH, MNC_MAX_LENGTH, formatPlmn } from "../../utils/plmn";
import { BrandChoiceLabel, CountryChoiceLabel } from "../shared/choiceLabels";
import { findBrand } from "./operatorBrands";
import { type PlmnProblem, keepDigits } from "./operatorPlmns";
import { InlineError } from "@/components/ui/error-state";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { brandsQueryOptions } from "@/features/shared/lookups";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";

type OperatorBrandSelectProps = {
  labelId: string;
  brandId: number | null;
  isDisabled: boolean;
  onBrandIdChange: (brandId: number | null) => void;
};

type OperatorCountryLockProps = {
  labelId: string;
  countryCode: string;
};

type PlmnCodeFieldsProps = {
  mcc: string;
  mnc: string;
  error: string | null;
  isDisabled: boolean;
  onMccChange: (mcc: string) => void;
  onMncChange: (mnc: string) => void;
  onMncBlur: () => void;
};

const NO_BRAND_VALUE = "none";
const MCC_LABEL = "MCC";
const MNC_LABEL = "MNC";

export const OPERATOR_NAME_MAX_LENGTH = 100;
export const OPERATOR_LEGAL_NAME_MAX_LENGTH = 250;
export const OPERATOR_SHORT_CODE_MAX_LENGTH = 16;

export function getPlmnProblemText(t: TFunction, problem: PlmnProblem, isOptional: boolean): string {
  if (problem === "mccFormat") return t("admin:reference.operator.plmn.dialog.mccFormat");
  if (problem === "mncFormat") return t("admin:reference.operator.plmn.dialog.mncFormat");
  return isOptional ? t("admin:reference.operator.create.plmnIncomplete") : t("admin:reference.operator.plmn.dialog.incomplete");
}

export function getPlmnOwnerText(t: TFunction, plmn: string, owner: Operator): string {
  return t("admin:reference.operator.plmn.dialog.takenBy", { plmn: formatPlmn(plmn), name: owner.name });
}

export function OperatorCountryLock({ labelId, countryCode }: OperatorCountryLockProps) {
  return (
    <Select value={countryCode} disabled>
      <SelectTrigger aria-labelledby={labelId} className="w-full">
        <SelectValue>
          <CountryChoiceLabel countryCode={countryCode} />
        </SelectValue>
      </SelectTrigger>
    </Select>
  );
}

export function OperatorBrandSelect({ labelId, brandId, isDisabled, onBrandIdChange }: OperatorBrandSelectProps) {
  const { t } = useTranslation("admin");
  const { data: brands, isError, isFetching, refetch } = useQuery(brandsQueryOptions());

  function pickBrand(value: string | null) {
    if (value === null) return;
    onBrandIdChange(value === NO_BRAND_VALUE ? null : Number(value));
  }

  if (brands === undefined) {
    if (!isError) return <Skeleton className="h-8 w-full rounded-lg" />;
    return <InlineError size="sm" title={t("reference.operators.brandsLoadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />;
  }

  const selectedBrand = findBrand(brands, brandId);

  return (
    <Select value={brandId === null ? NO_BRAND_VALUE : String(brandId)} onValueChange={pickBrand} disabled={isDisabled}>
      <SelectTrigger aria-labelledby={labelId} className="w-full cursor-pointer">
        <SelectValue>
          {selectedBrand === null ? (
            <span className="text-muted-foreground">
              <BrandChoiceLabel brand={null} />
            </span>
          ) : (
            <BrandChoiceLabel brand={selectedBrand} />
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_BRAND_VALUE} className="cursor-pointer">
          <BrandChoiceLabel brand={null} />
        </SelectItem>
        {brands.map((brand) => (
          <SelectItem key={brand.id} value={String(brand.id)} className="cursor-pointer">
            <BrandChoiceLabel brand={brand} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function PlmnCodeFields({ mcc, mnc, error, isDisabled, onMccChange, onMncChange, onMncBlur }: PlmnCodeFieldsProps) {
  const { t } = useTranslation("admin");
  const mccId = useId();
  const mncId = useId();
  const isInvalid = error !== null || undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        <Field data-invalid={isInvalid}>
          <FieldLabel htmlFor={mccId}>{MCC_LABEL}</FieldLabel>
          <Input
            {...NO_AUTOFILL_PROPS}
            id={mccId}
            value={mcc}
            onChange={(event) => onMccChange(keepDigits(event.target.value))}
            inputMode="numeric"
            maxLength={MCC_LENGTH}
            disabled={isDisabled}
            aria-invalid={isInvalid}
            className="font-mono"
          />
          <FieldDescription>{t("reference.operator.plmn.dialog.mccHint")}</FieldDescription>
        </Field>
        <Field data-invalid={isInvalid}>
          <FieldLabel htmlFor={mncId}>{MNC_LABEL}</FieldLabel>
          <Input
            {...NO_AUTOFILL_PROPS}
            id={mncId}
            value={mnc}
            onChange={(event) => onMncChange(keepDigits(event.target.value))}
            onBlur={onMncBlur}
            inputMode="numeric"
            maxLength={MNC_MAX_LENGTH}
            disabled={isDisabled}
            aria-invalid={isInvalid}
            className="font-mono"
          />
          <FieldDescription>{t("reference.operator.plmn.dialog.mncHint")}</FieldDescription>
        </Field>
      </div>
      {error === null ? null : <FieldError>{error}</FieldError>}
    </div>
  );
}
