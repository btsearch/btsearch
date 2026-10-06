import { Add01Icon, LockIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { addBandToPlan, bandPlanQueryOptions, removeBandFromPlan } from "../../api/bandPlan";
import { invalidateBandPlan, referenceKeys } from "../../api/queryKeys";
import type { Band } from "../../types";
import { getBandShortLabel } from "../../utils/bands";
import { showReferenceError } from "../../utils/errors";
import { PRESSED_TOGGLE_CLASS } from "../shared/facetToggles";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type BandPlanPillProps = {
  countryCode: string;
  band: Band;
  isInPlan: boolean;
  cellCount: number;
};

const ADD_FAILED_KEY = "admin:reference.country.bandPlan.addFailed";
const REMOVE_FAILED_KEY = "admin:reference.country.bandPlan.removeFailed";
const BAND_CODE_CLASS = "font-mono text-xs font-normal";
const OUT_OF_PLAN_CLASS = "cursor-pointer text-muted-foreground";
const IN_PLAN_CLASS = cn("cursor-pointer", PRESSED_TOGGLE_CLASS);
const LOCKED_CLASS = "cursor-not-allowed bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/10";

function getToggleKey(countryCode: string) {
  return [...referenceKeys.bandPlan(countryCode), "toggle"] as const;
}

function getToggleScope(countryCode: string, bandId: number): string {
  return `band-plan-${countryCode}-${bandId}`;
}

function getPillClass(isInPlan: boolean, isLocked: boolean): string {
  if (isLocked) return LOCKED_CLASS;
  return isInPlan ? IN_PLAN_CLASS : OUT_OF_PLAN_CLASS;
}

function withBand(plan: number[] | undefined, bandId: number, isInPlan: boolean): number[] | undefined {
  if (plan === undefined) return undefined;

  const otherBandIds = plan.filter((id) => id !== bandId);
  return isInPlan ? [...otherBandIds, bandId] : otherBandIds;
}

export function BandPlanPill({ countryCode, band, isInPlan, cellCount }: BandPlanPillProps) {
  const { t, i18n } = useTranslation("admin");
  const queryClient = useQueryClient();
  const lockNoteId = useId();

  const toggleMutation = useMutation({
    mutationKey: getToggleKey(countryCode),
    scope: { id: getToggleScope(countryCode, band.id) },
    mutationFn: (isAdding: boolean) => (isAdding ? addBandToPlan(countryCode, band.id) : removeBandFromPlan(countryCode, band.id)),
    onMutate: async (isAdding) => {
      const planKey = bandPlanQueryOptions(countryCode).queryKey;
      await queryClient.cancelQueries({ queryKey: planKey });
      queryClient.setQueryData(planKey, (plan) => withBand(plan, band.id, isAdding));
    },
    onError: (error, isAdding) => {
      queryClient.setQueryData(bandPlanQueryOptions(countryCode).queryKey, (plan) => withBand(plan, band.id, !isAdding));
      showReferenceError(error, isAdding ? ADD_FAILED_KEY : REMOVE_FAILED_KEY);
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: getToggleKey(countryCode) }) === 1) void invalidateBandPlan(queryClient, countryCode);
    },
  });

  const isLocked = isInPlan && cellCount > 0;
  let hint = t("reference.country.bandPlan.add");
  if (isLocked) hint = t("reference.country.bandPlan.locked", { count: cellCount });
  else if (isInPlan) hint = t("reference.country.bandPlan.remove");

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant={isInPlan ? "ghost" : "outline"}
              aria-pressed={isInPlan}
              aria-describedby={isLocked ? lockNoteId : undefined}
              disabled={isLocked}
              focusableWhenDisabled={isLocked}
              className={getPillClass(isInPlan, isLocked)}
              onClick={() => toggleMutation.mutate(!isInPlan)}
            />
          }
        >
          <HugeiconsIcon icon={isInPlan ? Tick02Icon : Add01Icon} data-icon="inline-start" aria-hidden="true" className="size-3.5" />
          {getBandShortLabel(band, i18n.language)}
          {band.code === null ? null : <span className={BAND_CODE_CLASS}>{band.code}</span>}
          {isLocked ? <HugeiconsIcon icon={LockIcon} aria-hidden="true" className="size-3" /> : null}
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
      {isLocked ? (
        <span id={lockNoteId} className="sr-only">
          {hint}
        </span>
      ) : null}
    </>
  );
}

export function BandPlanMark({ band }: { band: Band }) {
  const { i18n } = useTranslation();

  return (
    <li className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-muted px-2.5 text-sm font-medium whitespace-nowrap">
      {getBandShortLabel(band, i18n.language)}
      {band.code === null ? null : <span className={cn(BAND_CODE_CLASS, "text-muted-foreground")}>{band.code}</span>}
    </li>
  );
}
