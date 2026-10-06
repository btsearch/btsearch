import { useId } from "react";
import { useTranslation } from "react-i18next";

import type { StationView } from "../model/batchView";
import { type ExcludedFields, type FieldChoice, isFieldIncluded, listFieldChoices } from "../model/fieldSelection";
import type { BatchAction } from "../model/reviewState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { CELL_NUMBER_LABELS, RAT_FIELDS, RAT_ORDER } from "@/features/station-editing/model/ratFields";
import { cn } from "@/lib/utils";

type FieldsToSendPopoverProps = {
  stations: readonly StationView[];
  excludedFields: ExcludedFields;
  isLocked: boolean;
  onChange: (action: BatchAction) => void;
};

type FieldControlProps = Pick<FieldsToSendPopoverProps, "excludedFields" | "isLocked" | "onChange">;
type FieldToggleProps = FieldControlProps & { fields: readonly FieldChoice[]; label: string };
type FieldsPanelProps = FieldControlProps & { fields: readonly FieldChoice[] };

const LABEL_CLASS = "flex min-h-11 items-center gap-2 text-sm md:min-h-8";

function listStationFields(station: StationView): FieldChoice[] {
  if (station.isRemoved) return [];
  return station.sourceRows.flatMap((row) => (station.removedRows.has(row.index) ? [] : listFieldChoices(row)));
}

function FieldToggle({ fields, label, excludedFields, isLocked, onChange }: FieldToggleProps) {
  const { t } = useTranslation();
  const inputId = useId();
  const selected = fields.filter((choice) => isFieldIncluded(choice, excludedFields)).length;
  const allSelected = fields.length > 0 && selected === fields.length;
  const isRequired = fields.length > 0 && fields.every((choice) => choice.required);
  const isDisabled = isLocked || fields.length === 0 || isRequired;

  return (
    <label
      htmlFor={inputId}
      className={cn(LABEL_CLASS, isDisabled ? "cursor-default" : "cursor-pointer")}
      title={fields.some((choice) => choice.required) ? t("submissions:batch.requiredForNewCells") : undefined}
    >
      <Checkbox
        id={inputId}
        checked={allSelected}
        indeterminate={selected > 0 && !allSelected}
        disabled={isDisabled}
        onCheckedChange={() => onChange({ type: "setFields", fields, included: !allSelected })}
      />
      <span className="font-medium">{label}</span>
      {isRequired ? <span className="text-xs text-muted-foreground">{t("submissions:batch.requiredField")}</span> : null}
      <span className="ml-auto font-mono text-xs tabular-nums text-muted-foreground">
        {selected}/{fields.length}
      </span>
    </label>
  );
}

function FieldsPanel({ fields, excludedFields, isLocked, onChange }: FieldsPanelProps) {
  const { t } = useTranslation();
  const controls = { excludedFields, isLocked, onChange };

  return (
    <div className="max-h-[min(32rem,65svh)] overflow-y-auto p-3">
      <FieldToggle fields={fields.filter((choice) => !choice.required)} label={t("submissions:batch.optionalFields")} {...controls} />
      {RAT_ORDER.map((rat) => {
        const ratFields = fields.filter((choice) => choice.rat === rat);
        if (ratFields.length === 0) return null;
        const fieldNames = [...new Set(ratFields.map((choice) => choice.field))];
        return (
          <fieldset key={rat} className="mt-3 border-t pt-3">
            <legend className="text-xs font-semibold">{RAT_FIELDS[rat].name}</legend>
            {fieldNames.map((field) => (
              <FieldToggle
                key={field}
                fields={ratFields.filter((choice) => choice.field === field)}
                label={CELL_NUMBER_LABELS[field]}
                {...controls}
              />
            ))}
          </fieldset>
        );
      })}
    </div>
  );
}

export function FieldsToSendPopover({ stations, excludedFields, isLocked, onChange }: FieldsToSendPopoverProps) {
  const { t } = useTranslation();
  const fields = stations.flatMap(listStationFields);
  const selected = fields.filter((choice) => isFieldIncluded(choice, excludedFields)).length;
  const summary = t("submissions:batch.fieldsToSendSummary", { selected, total: fields.length });

  return (
    <Popover>
      <PopoverTrigger
        disabled={isLocked || fields.length === 0}
        render={<Button type="button" variant="outline" size="sm" className="h-11 cursor-pointer md:h-8" aria-label={summary} />}
      >
        {t("submissions:batch.fieldsToSend")}
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {selected}/{fields.length}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} collisionPadding={8} className="w-[min(24rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0">
        <PopoverTitle className="sr-only">{t("submissions:batch.fieldsToSend")}</PopoverTitle>
        <FieldsPanel fields={fields} excludedFields={excludedFields} isLocked={isLocked} onChange={onChange} />
        <p className="border-t px-3 py-2 text-xs leading-4 text-muted-foreground">{t("submissions:batch.requiredFieldsHint")}</p>
      </PopoverContent>
    </Popover>
  );
}
