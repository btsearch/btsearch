import { AlertCircleIcon, ArrowRight01Icon, Delete02Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import type { DraftCell } from "../../utils/fromAnalyzer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { getCellDetailKeys, getRatChannelField } from "@/features/shared/rat";
import { getRatDetailFieldLabel } from "@/features/shared/ratCellFields";
import { type AnalyzerDetailKey, getAnalyzerBandMhz, getAnalyzerBandNumber } from "@/features/submissions/utils/analyzerRatSpecs";
import { cn } from "@/lib/utils";

type AnalyzerFieldValue = number | boolean | string | undefined;

interface Props {
  change: DraftCell;
  selectedDuplex: string | null | undefined;
  onDuplexChange: (duplex: string | null) => void;
  onRemove: () => void;
}

export function AnalyzerCellChangeRow({ change, selectedDuplex, onDuplexChange, onRemove }: Props) {
  const { t } = useTranslation(["submissions", "common"]);
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

  const fields: { key: AnalyzerDetailKey; currentVal: AnalyzerFieldValue; newVal: AnalyzerFieldValue; isChanged: boolean }[] = [];

  const base = isAddOperation ? {} : (change.baseDetails ?? {});
  const changed = change.details;
  const allKeys = [...new Set([...getCellDetailKeys(change.rat), ...Object.keys(base), ...Object.keys(changed)])] as AnalyzerDetailKey[];
  for (const key of allKeys) {
    const currentVal = base[key];
    const newVal = changed[key];
    const isChanged = key in changed && newVal !== null && newVal !== undefined;
    if ((currentVal !== null && currentVal !== undefined) || isChanged)
      fields.push({ key, currentVal, newVal: isChanged ? newVal : undefined, isChanged });
  }

  return (
    <li
      className={cn(
        "relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-3 py-2 @4xl:grid-cols-[max-content_minmax(0,1fr)_auto] @4xl:gap-x-2 @sm:px-4",
        "before:absolute before:inset-y-2 before:left-0 before:w-px before:content-['']",
        change.conflict ? "bg-destructive/5 before:bg-destructive" : isAddOperation ? "before:bg-emerald-500" : "before:bg-amber-500",
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Badge
          variant="secondary"
          className={cn(
            change.conflict
              ? "bg-destructive/10 text-destructive"
              : isAddOperation
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
          )}
        >
          {t(isAddOperation ? "batch.addOperation" : "batch.updateOperation")}
        </Badge>
        <TechnologySummary bands={[change.rat]} className="mt-0 pl-0" />
        {mhz !== null || band !== null ? (
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {mhz !== null ? <span className="font-semibold text-foreground">{mhz} MHz</span> : null}
            {showBandNumber && band !== null ? <span className="opacity-75">{mhz !== null ? ` (b${band})` : `(b${band})`}</span> : null}
          </span>
        ) : null}
      </div>

      <dl className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-2 @4xl:col-start-2 @4xl:row-start-1 @4xl:gap-x-6 @4xl:border-l @4xl:pl-2">
        {fields.map(({ key, currentVal, newVal, isChanged }) => (
          <div key={key} className="flex min-w-0 items-baseline gap-1.5">
            <dt className="shrink-0 text-xs text-muted-foreground">{getRatDetailFieldLabel(change.rat, key)}</dt>
            <dd className="flex min-w-0 items-center gap-1.5 font-mono text-xs tabular-nums">
              {isChanged && currentVal !== null && currentVal !== undefined ? (
                <>
                  <span className="sr-only">{t("batch.currentValue")}</span>
                  <del className="truncate text-muted-foreground decoration-current">{String(currentVal)}</del>
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">{t("batch.newValue")}</span>
                  <ins className="truncate font-semibold text-amber-700 no-underline dark:text-amber-400">{String(newVal)}</ins>
                </>
              ) : isChanged ? (
                <>
                  <span className="sr-only">{t("batch.newValue")}</span>
                  <ins
                    className={cn(
                      "truncate font-semibold no-underline",
                      isAddOperation ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400",
                    )}
                  >
                    {String(newVal)}
                  </ins>
                </>
              ) : (
                <span className="truncate text-foreground">{String(currentVal)}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {ambiguousDuplex || hasUnresolvedBand || change.conflict ? (
        <div className="col-span-full flex flex-wrap items-center gap-2 @4xl:col-span-2 @4xl:col-start-2">
          {ambiguousDuplex ? (
            <Select value={selectedDuplex ?? ""} onValueChange={(value) => onDuplexChange(value || null)}>
              <SelectTrigger
                aria-label={t("batch.selectDuplexForCell", { row: change._rowIndex + 1 })}
                className={cn("h-11 w-24 shrink-0 text-xs sm:h-8", !selectedDuplex && "border-amber-500/60 text-amber-700 dark:text-amber-400")}
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
      <Button
        variant="ghost"
        size="icon-lg"
        className="col-start-2 row-start-1 size-11 cursor-pointer text-muted-foreground hover:text-destructive @4xl:col-start-3 sm:size-8"
        aria-label={t("batch.removeCell", { row: change._rowIndex + 1 })}
        onClick={onRemove}
      >
        <HugeiconsIcon icon={Delete02Icon} className="size-4" aria-hidden="true" />
      </Button>
    </li>
  );
}
