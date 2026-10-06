import { Cancel01Icon, CheckmarkCircle02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { ErrorsChip } from "@/features/station-editing/components/frame/errorsChip";
import { FLOATING_SURFACE_CLASS, TopBarActions, useTopBarPlacement } from "@/features/station-editing/components/frame/topBarActions";
import type { StationDraftApi } from "@/features/station-editing/hooks/useStationDraft";
import { cn } from "@/lib/utils";

type ReviewTopBarProps = {
  edit: StationDraftApi;
  errorsOpenRequest: number;
  isDecided: boolean;
  isBusy: boolean;
  canDecide: boolean;
  canSave: boolean;
  onReject: () => void;
  onApprove: () => void;
  onSave: () => void;
};

const REJECT_CLASS = "cursor-pointer text-destructive hover:bg-destructive/10 hover:text-destructive";
const APPROVE_CLASS = "cursor-pointer bg-emerald-600 text-white shadow-sm hover:bg-emerald-700";

export function ReviewTopBar({ edit, errorsOpenRequest, isDecided, isBusy, canDecide, canSave, onReject, onApprove, onSave }: ReviewTopBarProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const placement = useTopBarPlacement();
  const labelClass = placement === "header" ? "max-md:sr-only" : undefined;

  return (
    <TopBarActions>
      <ErrorsChip edit={edit} openRequest={errorsOpenRequest} />
      {isDecided ? (
        <p className="px-3 text-sm font-medium text-muted-foreground">{t("detail.readOnly")}</p>
      ) : (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canDecide}
            onClick={onReject}
            className={cn(REJECT_CLASS, placement === "floating" ? FLOATING_SURFACE_CLASS : null)}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            <span className={labelClass}>{t("header.reject")}</span>
          </Button>
          <Button type="button" size="sm" disabled={!canDecide} onClick={onApprove} className={APPROVE_CLASS}>
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
            <span className={labelClass}>{t("header.approve")}</span>
          </Button>
          <Button type="button" size="sm" disabled={!canSave} onClick={onSave} className="cursor-pointer font-medium shadow-sm">
            {isBusy ? <Spinner /> : <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />}
            <span className={labelClass}>{t("common:actions.saveChanges")}</span>
          </Button>
        </>
      )}
    </TopBarActions>
  );
}
