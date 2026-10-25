import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import { type BlockDraft, RADIO_VERSION_PREFIX_MAX_LENGTH, type SdkLimitError, readSdkLimitErrors } from "./blockDraft";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NO_AUTOFILL_PROPS } from "@/lib/autofill";
import { cn } from "@/lib/utils";

type ConditionsDraft = Pick<BlockDraft, "sdkIntMin" | "sdkIntMax" | "radioVersionPrefix">;

type BlockConditionsFieldsProps = {
  draft: BlockDraft;
  disabled: boolean;
  onChange: (change: Partial<ConditionsDraft>) => void;
};

type SdkLimitFieldProps = {
  label: string;
  value: string;
  error: SdkLimitError;
  disabled: boolean;
  onChange: (value: string) => void;
};

function hasConditions(draft: ConditionsDraft): boolean {
  return draft.sdkIntMin !== "" || draft.sdkIntMax !== "" || draft.radioVersionPrefix !== "";
}

function SdkLimitField({ label, value, error, disabled, onChange }: SdkLimitFieldProps) {
  const { t } = useTranslation("admin");
  const inputId = useId();
  const errorId = useId();

  return (
    <Field data-invalid={error !== null || undefined}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Input
        {...NO_AUTOFILL_PROPS}
        id={inputId}
        inputMode="numeric"
        value={value}
        disabled={disabled}
        aria-invalid={error !== null || undefined}
        aria-describedby={error === null ? undefined : errorId}
        className="font-mono"
        onChange={(event) => onChange(event.target.value)}
      />
      {error === null ? null : (
        <FieldError id={errorId}>
          {error === "range" ? t("measurements.blocks.dialog.sdkRangeError") : t("measurements.blocks.dialog.sdkOrderError")}
        </FieldError>
      )}
    </Field>
  );
}

export function BlockConditionsFields({ draft, disabled, onChange }: BlockConditionsFieldsProps) {
  const { t } = useTranslation("admin");
  const prefixId = useId();
  const [isOpen, setIsOpen] = useState(() => hasConditions(draft));
  const sdkErrors = readSdkLimitErrors(draft);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger render={<Button type="button" variant="ghost" size="sm" className="-ml-2 cursor-pointer text-muted-foreground" />}>
        {t("measurements.blocks.dialog.moreConditions")}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          data-icon="inline-end"
          aria-hidden="true"
          className={cn("transition-transform duration-150 ease-out motion-reduce:transition-none", isOpen && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-150 ease-out [&[hidden]:not([hidden='until-found'])]:hidden data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none">
        <div className="flex flex-col gap-4 pt-2">
          <div className="grid grid-cols-2 items-start gap-3">
            <SdkLimitField
              label={t("measurements.blocks.dialog.sdkMin")}
              value={draft.sdkIntMin}
              error={sdkErrors.min}
              disabled={disabled}
              onChange={(sdkIntMin) => onChange({ sdkIntMin })}
            />
            <SdkLimitField
              label={t("measurements.blocks.dialog.sdkMax")}
              value={draft.sdkIntMax}
              error={sdkErrors.max}
              disabled={disabled}
              onChange={(sdkIntMax) => onChange({ sdkIntMax })}
            />
          </div>
          <Field>
            <FieldLabel htmlFor={prefixId}>{t("measurements.blocks.dialog.radioVersionPrefix")}</FieldLabel>
            <Input
              {...NO_AUTOFILL_PROPS}
              id={prefixId}
              value={draft.radioVersionPrefix}
              maxLength={RADIO_VERSION_PREFIX_MAX_LENGTH}
              disabled={disabled}
              className="font-mono"
              onChange={(event) => onChange({ radioVersionPrefix: event.target.value })}
            />
            <FieldDescription>{t("measurements.blocks.dialog.radioVersionHint")}</FieldDescription>
          </Field>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
