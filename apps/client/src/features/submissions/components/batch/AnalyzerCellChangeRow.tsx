import { AlertCircleIcon, ArrowRight01Icon, Delete02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { DraftCell } from "../../utils/fromAnalyzer";
import { isAnalyzerCellIncluded } from "../../utils/fromAnalyzer";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { CellTypeInfoPopover } from "@/features/shared/CellTypeInfoPopover";
import { CellTypeSelect } from "@/features/shared/CellTypeSelect";
import { getCellDetailKeys, getRatChannelField } from "@/features/shared/rat";
import { getRatDetailFieldLabel } from "@/features/shared/ratCellFields";
import { SubmissionCellOperationBadge } from "@/features/submissions/components/submissionCellOperationBadge";
import {
  type AnalyzerDetailKey,
  getAnalyzerBandMhz,
  getAnalyzerBandNumber,
  isAnalyzerDetailRequired,
} from "@/features/submissions/utils/analyzerRatSpecs";
import { cn } from "@/lib/utils";
import type { CellType } from "@/types/station";

type AnalyzerFieldValue = number | boolean | string | undefined;

interface Props {
  change: DraftCell;
  selectedDuplex: string | null | undefined;
  onDuplexChange: (duplex: string | null) => void;
  onCellTypeChange: (cellType: CellType | null) => void;
  onFieldSelectionChange: (key: AnalyzerDetailKey, selected: boolean) => void;
  onRemove: () => void;
}

export function AnalyzerCellChangeRow({ change, selectedDuplex, onDuplexChange, onCellTypeChange, onFieldSelectionChange, onRemove }: Props) {
  const { t } = useTranslation(["submissions", "common", "stations"]);
  const isAddOperation = change.operation === "add";

  const channelField = getRatChannelField(change.rat);
  const channelKey = channelField as AnalyzerDetailKey | null;
  const channelValue = channelKey ? (change.details[channelKey] ?? change.baseDetails?.[channelKey]) : undefined;
  const channel = typeof channelValue === "number" ? channelValue : undefined;
  const ambiguousDuplex = isAddOperation && change.duplexChoices.length > 0;
  const band = channel !== undefined ? getAnalyzerBandNumber(change.rat, channel) : null;
  const mhz = channel !== undefined ? getAnalyzerBandMhz(change.rat, channel) : null;
  const showBandNumber = !ambiguousDuplex || !!selectedDuplex;
  const hasUnresolvedBand = isAddOperation && change.band_id === null && change.duplexChoices.length === 0;
  const isIncluded = isAnalyzerCellIncluded(change);
  let rowStateClassName = "before:bg-amber-500";
  if (change.conflict) rowStateClassName = "bg-destructive/5 before:bg-destructive";
  else if (!isIncluded) rowStateClassName = "bg-muted/15 before:bg-muted-foreground/30";
  else if (isAddOperation) rowStateClassName = "before:bg-emerald-500";

  const fields: {
    key: AnalyzerDetailKey;
    currentVal: AnalyzerFieldValue;
    newVal: AnalyzerFieldValue;
    isChanged: boolean;
    isRequired: boolean;
    isSelected: boolean;
  }[] = [];

  const base = isAddOperation ? {} : (change.baseDetails ?? {});
  const changed = change.details;
  const allKeys = [...new Set([...getCellDetailKeys(change.rat), ...Object.keys(base), ...Object.keys(changed)])] as AnalyzerDetailKey[];
  for (const key of allKeys) {
    const currentVal = base[key];
    const newVal = changed[key];
    const isChanged = key in changed && newVal !== null && newVal !== undefined;
    const isRequired = isChanged && isAnalyzerDetailRequired(change.operation, change.rat, key);
    const isSelected = !isChanged || isRequired || change.selectedDetailKeys.has(key);
    if ((currentVal !== null && currentVal !== undefined) || isChanged)
      fields.push({ key, currentVal, newVal: isChanged ? newVal : undefined, isChanged, isRequired, isSelected });
  }

  return (
    <li
      className={cn(
        "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 px-2.5 py-1.5 @4xl:grid-cols-[max-content_minmax(0,1fr)_auto] @4xl:gap-x-2 @4xl:gap-y-1.5 sm:px-4 sm:py-2",
        "before:absolute before:inset-y-2 before:left-0 before:w-px before:content-['']",
        rowStateClassName,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
        <SubmissionCellOperationBadge operation={change.operation} conflict={change.conflict} />
        <TechnologySummary bands={[change.rat]} className="mt-0 pl-0" />
        {mhz !== null || band !== null ? (
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {mhz !== null ? <span className="font-semibold text-foreground">{mhz} MHz</span> : null}
            {showBandNumber && band !== null ? <span className="opacity-75">{mhz !== null ? ` (b${band})` : `(b${band})`}</span> : null}
          </span>
        ) : null}
        <div className="flex shrink-0 items-center gap-2.5">
          <CellTypeSelect
            value={change.type ?? null}
            onChange={onCellTypeChange}
            ariaLabel={t("stations:cells.cellType")}
            className="relative h-8 w-20 shrink-0 text-xs after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] focus:border-ring focus:ring-[3px] focus:ring-ring/50"
          />
          <CellTypeInfoPopover align="center" className="relative size-6 after:absolute after:-inset-2.5 after:content-['']" />
        </div>
      </div>

      <div className="col-span-full row-start-2 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 @4xl:col-span-1 @4xl:col-start-2 @4xl:row-start-1 @4xl:border-l @4xl:pl-2 [&>*+*]:before:shrink-0 [&>*+*]:before:text-muted-foreground/40 [&>*+*]:before:content-['/']">
        {fields.map(({ key, currentVal, newVal, isChanged, isRequired, isSelected }) => {
          const fieldLabel = getRatDetailFieldLabel(change.rat, key);
          const fieldId = `analyzer-field-${change._rowIndex}-${key}`;
          let newValueClassName = "text-amber-700 dark:text-amber-400";
          if (!isSelected) newValueClassName = "text-muted-foreground";
          else if (isAddOperation) newValueClassName = "text-emerald-700 dark:text-emerald-400";

          let valueContent = <span className="truncate text-foreground">{String(currentVal)}</span>;
          if (isChanged && currentVal !== null && currentVal !== undefined) {
            valueContent = (
              <>
                <span className="sr-only">{t("batch.currentValue")}</span>
                <del className="truncate text-muted-foreground decoration-current">{String(currentVal)}</del>
                <HugeiconsIcon icon={ArrowRight01Icon} className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="sr-only">{t("batch.newValue")}</span>
                <ins
                  className={cn("truncate font-semibold no-underline", isSelected ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}
                >
                  {String(newVal)}
                </ins>
              </>
            );
          } else if (isChanged) {
            valueContent = (
              <>
                <span className="sr-only">{t("batch.newValue")}</span>
                <ins className={cn("truncate font-semibold no-underline", newValueClassName)}>{String(newVal)}</ins>
              </>
            );
          }

          const value = <span className="flex min-w-0 items-center gap-1.5 font-mono text-xs tabular-nums">{valueContent}</span>;

          if (!isChanged)
            return (
              <div key={key} className="flex min-w-0 items-baseline gap-1.5">
                <span className="shrink-0 text-xs text-muted-foreground">{fieldLabel}</span>
                {value}
              </div>
            );

          return (
            <div key={key} className="flex min-h-11 min-w-0 items-center gap-1.5">
              <Checkbox
                id={fieldId}
                checked={isSelected}
                disabled={isRequired}
                onCheckedChange={(checked) => onFieldSelectionChange(key, checked === true)}
                aria-label={t("batch.includeField", { field: fieldLabel, rat: change.rat, row: change._rowIndex + 1 })}
              />
              <label htmlFor={fieldId} className={cn("flex min-h-11 min-w-0 items-center gap-1.5", isRequired ? "cursor-default" : "cursor-pointer")}>
                <span className="shrink-0 text-xs text-muted-foreground">{fieldLabel}</span>
                {value}
                {isRequired ? <span className="sr-only">{t("batch.requiredField")}</span> : null}
              </label>
            </div>
          );
        })}
        {!isIncluded ? (
          <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground @4xl:hidden">
            {t("batch.notIncluded")}
          </span>
        ) : null}
      </div>

      {ambiguousDuplex || hasUnresolvedBand || change.conflict ? (
        <div className="col-span-full flex flex-wrap items-center gap-2 @4xl:col-span-2 @4xl:col-start-2">
          {ambiguousDuplex ? (
            <Select value={selectedDuplex ?? ""} onValueChange={(value) => onDuplexChange(value || null)}>
              <SelectTrigger
                aria-label={t("batch.selectDuplexForCell", { row: change._rowIndex + 1 })}
                className={cn(
                  "relative h-8 w-24 shrink-0 text-xs after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
                  !selectedDuplex && "border-amber-500/60 text-amber-700 dark:text-amber-400",
                )}
              >
                <SelectValue>{selectedDuplex ?? t("batch.selectDuplex")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {change.duplexChoices.map(({ duplex }) => (
                  <SelectItem key={duplex ?? "_none"} value={duplex ?? ""}>
                    {duplex ?? "-"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {hasUnresolvedBand ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <HugeiconsIcon icon={InformationCircleIcon} className="size-3.5" aria-hidden="true" />
              {t("batch.bandNotMatched")}
            </span>
          ) : null}
          {change.conflict ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive">
              <HugeiconsIcon icon={AlertCircleIcon} className="size-3.5" aria-hidden="true" />
              {t("batch.conflictBadge")}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="col-start-2 row-start-1 flex items-center gap-1.5 self-start @4xl:col-start-3 @4xl:self-center">
        {!isIncluded ? (
          <span className="hidden shrink-0 whitespace-nowrap text-xs text-muted-foreground @4xl:inline">{t("batch.notIncluded")}</span>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          className="relative size-8 shrink-0 cursor-pointer text-muted-foreground after:absolute after:-inset-1.5 after:content-[''] hover:text-destructive"
          aria-label={t("batch.removeCell", { row: change._rowIndex + 1 })}
          onClick={onRemove}
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
