import { Add01Icon, Cancel01Icon, Delete02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { FLOATING_NAV_ACTION_TARGET_ID } from "@/components/layout/floatingNav";
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
import {
  DetailHeader,
  DetailHeaderId,
  DetailHeaderLocation,
  DetailHeaderSeparator,
  DetailHeaderStationActions,
  DetailHeaderTimestamp,
} from "@/features/admin/components/detailHeader";
import { useDeleteStationMutation } from "@/features/admin/stations/mutations";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { VirtualStationBadge } from "@/features/station-details/components/virtualStationBadge";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import { showApiError } from "@/lib/api";
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
  const { t } = useTranslation(["stations", "common"]);
  const navigate = useNavigate();
  const deleteMutation = useDeleteStationMutation();
  const navActionTarget = useNavActionTarget();
  const { openStationDialog } = useFloatingDialogStack();

  const savedStation = isCreateMode ? undefined : station;
  const statusBadge = savedStation?.status ? (
    <StationStatusBadge status={savedStation.status} statusChangedAt={savedStation.statusChangedAt} />
  ) : null;
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
              {isCreateMode ? t("common:actions.createStation") : t("common:actions.saveChanges")}
            </span>
          </Button>
        </TooltipTrigger>
        {!hasChanges && <TooltipContent>{t("common:actions.noChanges")}</TooltipContent>}
      </Tooltip>
    </div>
  );

  return (
    <DetailHeader
      actionBar={actionBar}
      operator={selectedOperator ?? station?.operator}
      stationCode={isCreateMode ? undefined : (station?.station_id ?? stationId)}
      badges={
        savedStation ? (
          <>
            <VirtualStationBadge station={savedStation} onOpenStation={(id) => openStationDialog(id, "internal")} />
            {savedStation.is_confirmed ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <HugeiconsIcon icon={Tick02Icon} className="size-3.5" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{t("common:labels.confirmed")}</span>
              </span>
            ) : null}
            {statusBadge}
          </>
        ) : null
      }
      compactBadges={statusBadge}
      subtitle={
        savedStation?.location ? (
          <DetailHeaderLocation
            locationId={savedStation.location.id}
            city={savedStation.location.city || `#${savedStation.location.id}`}
            address={savedStation.extra_address || savedStation.location.address}
          />
        ) : null
      }
      meta={
        savedStation ? (
          <>
            <DetailHeaderTimestamp label={t("common:labels.created")} value={savedStation.createdAt} />
            <DetailHeaderSeparator />
            <DetailHeaderTimestamp label={t("common:labels.updated")} value={savedStation.updatedAt} />
            <DetailHeaderSeparator />
            <DetailHeaderId value={String(savedStation.id)} />
          </>
        ) : null
      }
      actions={savedStation ? <DetailHeaderStationActions station={savedStation} /> : null}
    />
  );
}
