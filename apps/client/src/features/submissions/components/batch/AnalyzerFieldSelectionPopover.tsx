import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { type AnalyzerDetailKey, type AnalyzerRat, isAnalyzerDetailRequired } from "../../utils/analyzerRatSpecs";
import type { DraftStation } from "../../utils/fromAnalyzer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RAT_ORDER, getCellDetailKeys } from "@/features/shared/rat";
import { getRatDetailFieldLabel } from "@/features/shared/ratCellFields";
import { cn } from "@/lib/utils";

interface AnalyzerFieldSelectionPopoverProps {
  stations: readonly DraftStation[];
  onFieldSelectionChange: (rat: AnalyzerRat, key: AnalyzerDetailKey, selected: boolean) => void;
  onAllOptionalFieldsChange: (selected: boolean) => void;
  className?: string;
}

interface FieldSelectionSummary {
  rat: AnalyzerRat;
  key: AnalyzerDetailKey;
  applicableCount: number;
  selectedCount: number;
  optionalCount: number;
  requiredCount: number;
}

function getFieldOrder(rat: AnalyzerRat, key: AnalyzerDetailKey): number {
  const index = getCellDetailKeys(rat).indexOf(key);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function getFieldSelectionGroups(stations: readonly DraftStation[]) {
  const fields = new Map<string, FieldSelectionSummary>();

  for (const station of stations) {
    for (const cell of station.cells) {
      for (const key of Object.keys(cell.details) as AnalyzerDetailKey[]) {
        const mapKey = `${cell.rat}:${key}`;
        const field = fields.get(mapKey) ?? {
          rat: cell.rat,
          key,
          applicableCount: 0,
          selectedCount: 0,
          optionalCount: 0,
          requiredCount: 0,
        };
        const required = isAnalyzerDetailRequired(cell.operation, cell.rat, key);
        const selected = cell.selectedDetailKeys.has(key);

        field.applicableCount += 1;
        if (selected) field.selectedCount += 1;
        if (required) field.requiredCount += 1;
        else field.optionalCount += 1;
        fields.set(mapKey, field);
      }
    }
  }

  return RAT_ORDER.flatMap((rat) => {
    const ratFields = [...fields.values()]
      .filter((field) => field.rat === rat)
      .sort((a, b) => getFieldOrder(rat, a.key) - getFieldOrder(rat, b.key) || a.key.localeCompare(b.key));
    return ratFields.length > 0 ? [{ rat, fields: ratFields }] : [];
  });
}

export function AnalyzerFieldSelectionPopover({
  stations,
  onFieldSelectionChange,
  onAllOptionalFieldsChange,
  className,
}: AnalyzerFieldSelectionPopoverProps) {
  const { t } = useTranslation("submissions");
  const id = useId();
  const groups = getFieldSelectionGroups(stations);

  const fields = groups.flatMap((group) => group.fields);
  const totalCount = fields.reduce((count, field) => count + field.applicableCount, 0);
  const selectedCount = fields.reduce((count, field) => count + field.selectedCount, 0);
  const optionalCount = fields.reduce((count, field) => count + field.optionalCount, 0);
  const selectedOptionalCount = fields.reduce((count, field) => count + field.selectedCount - field.requiredCount, 0);
  const allOptionalSelected = selectedOptionalCount === optionalCount;
  const partlySelected = selectedOptionalCount > 0 && !allOptionalSelected;

  return (
    <Popover>
      <PopoverTrigger
        disabled={fields.length === 0}
        render={
          <Button
            type="button"
            variant="outline"
            className={cn("group h-11 w-full justify-start gap-2 font-normal sm:h-8 sm:w-auto", className)}
            aria-label={t("batch.fieldsToSendSummary", { selected: selectedCount, total: totalCount })}
          />
        }
      >
        <span className="truncate">{t("batch.fieldsToSend")}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
          {selectedCount}/{totalCount}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-popup-open:rotate-180 motion-reduce:transition-none"
          aria-hidden="true"
        />
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={6} className="w-[min(14rem,calc(100vw-1rem))] gap-0 overflow-hidden p-0">
        <label
          htmlFor={`${id}-all`}
          className={cn(
            "flex min-h-11 items-center gap-2.5 border-b px-3 py-1.5 sm:min-h-8",
            optionalCount === 0 ? "cursor-not-allowed" : "cursor-pointer hover:bg-muted/50",
          )}
        >
          <Checkbox
            id={`${id}-all`}
            checked={allOptionalSelected}
            indeterminate={partlySelected}
            disabled={optionalCount === 0}
            onCheckedChange={() => onAllOptionalFieldsChange(!allOptionalSelected)}
          />
          <span className="min-w-0 flex-1 truncate text-sm">{t("batch.optionalFields")}</span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {selectedOptionalCount}/{optionalCount}
          </span>
        </label>

        <div className="max-h-[min(20rem,55svh)] overflow-y-auto py-1">
          {groups.map((group) => (
            <fieldset key={group.rat}>
              <legend className="px-2 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{group.rat}</legend>
              {group.fields.map((field) => {
                const allSelected = field.selectedCount === field.applicableCount;
                const partlySelected = field.selectedCount > 0 && !allSelected;
                const allRequired = field.optionalCount === 0;
                const inputId = `${id}-${field.rat.toLowerCase()}-${field.key}`;

                return (
                  <label
                    key={field.key}
                    htmlFor={inputId}
                    className={cn(
                      "flex min-h-11 items-center gap-2.5 px-3 py-1.5 transition-colors sm:min-h-8",
                      allRequired ? "cursor-not-allowed" : "cursor-pointer hover:bg-muted/60",
                    )}
                  >
                    <Checkbox
                      id={inputId}
                      checked={allSelected}
                      indeterminate={partlySelected}
                      disabled={allRequired}
                      onCheckedChange={() => onFieldSelectionChange(field.rat, field.key, !allSelected)}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">{getRatDetailFieldLabel(field.rat, field.key)}</span>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                      {allRequired ? t("batch.requiredField") : `${field.selectedCount}/${field.applicableCount}`}
                      {field.requiredCount > 0 && !allRequired ? <span className="sr-only">, {t("batch.requiredForNewCells")}</span> : null}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ))}
        </div>
        <p className="border-t px-3 py-2 text-[11px] leading-4 text-muted-foreground">{t("batch.requiredFieldsHint")}</p>
      </PopoverContent>
    </Popover>
  );
}
