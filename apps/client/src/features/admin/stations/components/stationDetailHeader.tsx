import { Add01Icon, ArrowLeft01Icon, Cancel01Icon, Delete02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floating-nav";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useNavActionTarget } from "@/contexts/navActions";
import { DetailHeaderMetaItem, DetailHeaderTimestamp } from "@/features/admin/components/detailHeaderMeta";
import { useDeleteStationMutation } from "@/features/admin/stations/mutations";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import { useScrolled } from "@/hooks/useScrolled";
import { showApiError } from "@/lib/api";
import { getOperatorColor } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";
import type { Operator, Station } from "@/types/station";

type StationDetailHeaderProps = {
  station?: Station;
  stationId: string;
  isCreateMode: boolean;
  selectedOperator?: Operator;
  isSaving: boolean;
  hasChanges: boolean;
  onSave: () => void;
  onRevert: () => void;
};

export function StationDetailHeader({
  station,
  stationId,
  isCreateMode,
  selectedOperator,
  isSaving,
  hasChanges,
  onSave,
  onRevert,
}: StationDetailHeaderProps) {
  const { t, i18n } = useTranslation(["stations", "common"]);
  const navigate = useNavigate();
  const deleteMutation = useDeleteStationMutation();
  const navActionTarget = useNavActionTarget();

  const { ref: headerRef, scrolled } = useScrolled();
  const stationLabel = isCreateMode ? t("common:labels.newStation") : (station?.station_id ?? stationId);
  const operatorLabel = selectedOperator?.name ?? station?.operator.name ?? "-";
  const locationLabel = station?.location ? [station.location.city, station.location.address].filter(Boolean).join(", ") : "-";
  const operatorAccentColor = selectedOperator ? getOperatorColor(selectedOperator.mnc) : "transparent";
  const isFloatingActionTarget = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const isHeaderActionTarget = !!navActionTarget && !isFloatingActionTarget;

  const handleDelete = () => {
    if (!station) return;
    deleteMutation.mutate(station.id, {
      onSuccess: () => {
        toast.success(t("toast.deleted"));
        void navigate({ to: "/admin/stations" });
      },
      onError: (error) => {
        showApiError(error);
      },
    });
  };

  const actionBar = (
    <div className="flex items-center gap-1">
      {!isCreateMode && station && (
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  "text-destructive hover:bg-destructive/10 hover:text-destructive",
                  isFloatingActionTarget && "max-md:bg-background max-md:dark:bg-background",
                )}
              />
            }
          >
            <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
            <span className={cn(isHeaderActionTarget && "max-md:sr-only")}>{t("header.deleteStation")}</span>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("header.confirmDelete")}</AlertDialogTitle>
              <AlertDialogDescription>{t("header.confirmDeleteDesc")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? <Spinner /> : t("header.deleteStation")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRevert}
            disabled={!hasChanges}
            className={cn(
              "text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive",
              isFloatingActionTarget &&
                "max-md:bg-background max-md:dark:bg-background max-md:disabled:opacity-100 max-md:disabled:text-muted-foreground/50",
            )}
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
            <span className={cn(isHeaderActionTarget && "max-md:sr-only")}>
              {isCreateMode ? t("common:actions.clear") : t("common:actions.revert")}
            </span>
          </Button>
        </TooltipTrigger>
        {!hasChanges && <TooltipContent>{t("common:actions.noChanges")}</TooltipContent>}
      </Tooltip>
      <Tooltip>
        <TooltipTrigger render={<span />}>
          <Button
            size="sm"
            onClick={onSave}
            disabled={isSaving || !hasChanges}
            className={cn(
              "font-medium shadow-sm",
              !isFloatingActionTarget && "md:min-w-25 md:px-4",
              isFloatingActionTarget && "max-md:bg-primary max-md:disabled:opacity-100 max-md:disabled:text-primary-foreground/50",
            )}
          >
            {isSaving ? <Spinner /> : <HugeiconsIcon icon={isCreateMode ? Add01Icon : Tick02Icon} className="size-3.5" />}
            <span className={cn(isFloatingActionTarget && isCreateMode && "hidden sm:inline", isHeaderActionTarget && "max-md:sr-only")}>
              {isCreateMode ? t("header.createStation") : t("common:actions.saveChanges")}
            </span>
          </Button>
        </TooltipTrigger>
        {!hasChanges && <TooltipContent>{t("common:actions.noChanges")}</TooltipContent>}
      </Tooltip>
    </div>
  );

  return (
    <>
      <div
        ref={headerRef}
        className={cn(
          "contents md:block md:shrink-0 md:border-b md:border-border md:px-4 md:py-2 md:sticky md:top-0 md:z-20 md:transition-[background-color,border-color,box-shadow] md:duration-150",
          scrolled ? "md:bg-background md:shadow-[0_1px_3px_rgba(0,0,0,0.06)]" : "md:bg-background md:border-transparent md:shadow-none",
        )}
        style={{
          borderTopWidth: "3px",
          borderTopColor: operatorAccentColor,
        }}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-3 max-md:sticky max-md:top-0 max-md:z-30 max-md:border-b max-md:border-border max-md:border-t-[3px] max-md:bg-background max-md:px-4 max-md:py-2 max-md:transition-[background-color,border-color,box-shadow] max-md:duration-150",
            scrolled ? "max-md:shadow-[0_1px_3px_rgba(0,0,0,0.06)]" : "max-md:border-b-transparent max-md:shadow-none",
          )}
          style={{ borderTopColor: operatorAccentColor }}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.back()}
            className="text-muted-foreground hover:text-foreground gap-2 pl-1 pr-3 -ml-2 hover:bg-muted/50 transition-colors"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
            <span className="font-medium">{t("common:actions.back")}</span>
          </Button>
          {!navActionTarget && actionBar}
        </div>

        <div className="border-border/50 bg-background max-md:border-b max-md:px-4 max-md:py-2 md:mt-2 md:border-t md:pt-2">
          <div className="flex items-start gap-3 overflow-hidden">
            {selectedOperator && (
              <div className="mt-1.5 size-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: getOperatorColor(selectedOperator.mnc) }} />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-sm font-semibold text-foreground truncate">{stationLabel}</h1>
                {!isCreateMode && station?.status && <StationStatusBadge status={station.status} statusChangedAt={station.statusChangedAt} />}
              </div>
              <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:flex sm:items-center sm:gap-4 overflow-hidden">
                <DetailHeaderMetaItem label={t("common:labels.operator")} value={operatorLabel} className="min-w-0 sm:max-w-40" />
                <DetailHeaderMetaItem label={t("common:labels.id")} value={station?.id ?? "-"} />
                <DetailHeaderTimestamp label={t("common:labels.created")} value={station?.createdAt} locale={i18n.language} />
                <DetailHeaderTimestamp label={t("common:labels.updated")} value={station?.updatedAt} locale={i18n.language} />
                <DetailHeaderMetaItem label={t("common:labels.location")} value={locationLabel} className="min-w-0 sm:max-w-96 col-span-2" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {navActionTarget ? createPortal(actionBar, navActionTarget) : null}
    </>
  );
}
