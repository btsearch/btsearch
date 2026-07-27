import { ArrowLeft01Icon, Cancel01Icon, CheckmarkCircle02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

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
import { useNavActionTarget } from "@/contexts/navActions";
import { SUBMISSION_STATUS, SUBMISSION_TYPE } from "@/features/admin/submissions/submissionUI";
import type { SubmissionDetail } from "@/features/admin/submissions/types";
import { useScrolled } from "@/hooks/useScrolled";
import { cn } from "@/lib/utils";

type SubmissionDetailHeaderProps = {
  submission: SubmissionDetail;
  isReadOnly: boolean;
  isProcessing: boolean;
  onApprove: () => void;
  onReject: () => void;
  onSave: () => void;
};

export function SubmissionDetailHeader({ submission, isReadOnly, isProcessing, onApprove, onReject, onSave }: SubmissionDetailHeaderProps) {
  const { t } = useTranslation(["submissions", "common"]);
  const { ref: headerRef, scrolled } = useScrolled();
  const navActionTarget = useNavActionTarget();
  const isFloatingActionTarget = navActionTarget?.id === FLOATING_NAV_ACTION_TARGET_ID;
  const isHeaderActionTarget = !!navActionTarget && !isFloatingActionTarget;

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
    <>
      <div
        ref={headerRef}
        className={cn(
          "shrink-0 border-b px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 sm:gap-4 sticky top-0 z-20 transition-[background-color,border-color,box-shadow] duration-150",
          scrolled ? "bg-background shadow-sm" : "bg-transparent border-transparent shadow-none",
        )}
      >
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.back()}
            className="text-muted-foreground hover:text-foreground gap-2 pl-1 pr-3 -ml-2 hover:bg-muted/50 transition-colors"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
            <span className="font-medium">{t("common:actions.back")}</span>
          </Button>
        </div>

        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-wider border shrink-0",
              SUBMISSION_TYPE[submission.type].badgeClass,
            )}
          >
            <span className={cn("size-1.5 rounded-[1px]", SUBMISSION_TYPE[submission.type].dotClass)} />
            {t(`common:submissionType.${submission.type}`)}
          </span>
          <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md shrink-0", SUBMISSION_STATUS[submission.status].bgClass)}>
            <HugeiconsIcon
              icon={SUBMISSION_STATUS[submission.status].icon}
              className={cn("size-3.5", SUBMISSION_STATUS[submission.status].iconClass)}
            />
            <span className="text-xs font-medium capitalize">{t(`common:status.${submission.status}`)}</span>
          </div>
          <span className="text-xs font-mono text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded border border-border/40 truncate min-w-0">
            {submission.id}
          </span>
        </div>
        {!navActionTarget && <div className="flex flex-wrap items-center gap-2 sm:w-auto">{actionBar}</div>}
      </div>

      {navActionTarget ? createPortal(actionBar, navActionTarget) : null}
    </>
  );
}
