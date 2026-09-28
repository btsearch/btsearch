import { Cancel01Icon, CheckmarkCircle02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslation } from "react-i18next";

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
import { useNavActionTarget } from "@/contexts/navActions";
import {
  DetailHeader,
  DetailHeaderId,
  DetailHeaderLocation,
  DetailHeaderSeparator,
  DetailHeaderStationActions,
  DetailHeaderTimestamp,
} from "@/features/admin/components/detailHeader";
import type { SubmissionDetail } from "@/features/admin/submissions/types";
import { SubmissionStatusBadge } from "@/features/submissions/components/submissionStatusBadge";
import { SubmissionTypeBadge } from "@/features/submissions/components/submissionTypeBadge";
import { cn } from "@/lib/utils";
import type { Operator, Station } from "@/types/station";

type SubmissionDetailHeaderProps = {
  submission: SubmissionDetail;
  currentStation: Station | null;
  operator: Operator | null;
  isReadOnly: boolean;
  isProcessing: boolean;
  onApprove: () => void;
  onReject: () => void;
  onSave: () => void;
};

export function SubmissionDetailHeader({
  submission,
  currentStation,
  operator,
  isReadOnly,
  isProcessing,
  onApprove,
  onReject,
  onSave,
}: SubmissionDetailHeaderProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const navActionTarget = useNavActionTarget();
  const isFloatingActionTarget = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const isHeaderActionTarget = !!navActionTarget && !isFloatingActionTarget;

  const city = currentStation ? currentStation.location.city : submission.proposedLocation?.city;
  const address = currentStation ? currentStation.extra_address || currentStation.location.address : submission.proposedLocation?.address;

  const actionBar = (
    <div className="flex items-center gap-1">
      {isReadOnly ? (
        <div className="px-3 text-sm font-medium text-muted-foreground">{t("detail.readOnly")}</div>
      ) : (
        <>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isProcessing}
                  className={cn(
                    "text-destructive hover:text-destructive hover:bg-destructive/10",
                    isFloatingActionTarget && "max-md:bg-background max-md:dark:bg-background",
                  )}
                />
              }
            >
              {isHeaderActionTarget ? <HugeiconsIcon icon={Cancel01Icon} className="size-3.5 md:hidden" /> : null}
              <span className={cn(isHeaderActionTarget && "max-md:sr-only")}>{t("header.reject")}</span>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("rejectApproveCard.confirmReject")}</AlertDialogTitle>
                <AlertDialogDescription>{t("rejectApproveCard.confirmRejectDesc")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={onReject} disabled={isProcessing}>
                  {t("header.reject")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="default" size="sm" disabled={isProcessing} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" />
              }
            >
              {isHeaderActionTarget ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5 md:hidden" /> : null}
              <span className={cn(isHeaderActionTarget && "max-md:sr-only")}>{t("header.approve")}</span>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("rejectApproveCard.confirmApprove")}</AlertDialogTitle>
                <AlertDialogDescription>{t("rejectApproveCard.confirmApproveDesc")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common:actions.cancel")}</AlertDialogCancel>
                <AlertDialogAction className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={onApprove} disabled={isProcessing}>
                  {t("header.approve")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button size="sm" onClick={onSave} disabled={isProcessing} className="shadow-sm font-medium">
            {isProcessing ? (
              <Spinner />
            ) : (
              <>
                {isHeaderActionTarget ? <HugeiconsIcon icon={Tick02Icon} className="size-3.5 md:hidden" /> : null}
                <span className={cn(isHeaderActionTarget && "max-md:sr-only")}>{t("common:actions.saveChanges")}</span>
              </>
            )}
          </Button>
        </>
      )}
    </div>
  );

  return (
    <DetailHeader
      actionBar={actionBar}
      operator={operator}
      stationCode={submission.station?.station_id || submission.proposedStation?.station_id}
      badges={
        <>
          <SubmissionTypeBadge type={submission.type} />
          <SubmissionStatusBadge status={submission.status} />
        </>
      }
      compactBadges={<SubmissionStatusBadge status={submission.status} compact />}
      subtitle={city || address ? <DetailHeaderLocation locationId={currentStation?.location.id} city={city} address={address} /> : null}
      meta={
        <>
          <DetailHeaderTimestamp label={t("common:labels.submitted")} value={submission.createdAt} />
          {submission.reviewed_at ? (
            <>
              <DetailHeaderSeparator />
              <DetailHeaderTimestamp label={t("common:labels.reviewed")} value={submission.reviewed_at} />
            </>
          ) : null}
          <DetailHeaderSeparator />
          <DetailHeaderId value={submission.id} displayValue={submission.id.slice(0, 8)} />
        </>
      }
      actions={currentStation ? <DetailHeaderStationActions station={currentStation} /> : null}
    />
  );
}
