import { CheckmarkCircle02Icon, SentIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { formatAllowanceWait } from "../../data/allowance";
import { ApplyDialog, SendNotePopover } from "./sendDialogs";
import { APPLY_STATION_CAP, type AnalyzerBatch, type BrakeNotice } from "./useAnalyzerBatch";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { CHIP_LIST_CLASS, ErrorsChipShell } from "@/features/station-editing/components/frame/errorsChip";
import { type ErrorRowItem, ErrorRows } from "@/features/station-editing/components/frame/errorsList";
import { FLOATING_PRIMARY_CLASS, FLOATING_SURFACE_CLASS, TopBarActions } from "@/features/station-editing/components/frame/topBarActions";
import { EDIT_LIMITS } from "@/features/station-editing/model/validate";
import { cn } from "@/lib/utils";

export type BatchErrorTarget = {
  stationId: number | null;
  rowIndex: number | null;
};

export type BatchErrorItem = BatchErrorTarget & {
  id: string;
  where: string;
  message: string;
};

type BatchFooterProps = {
  batch: AnalyzerBatch;
  errors: readonly BatchErrorItem[];
  isStaff: boolean;
  isPhone: boolean;
  areSubmissionsOn: boolean;
  onReveal: (target: BatchErrorTarget) => void;
};

type BatchCheckProps = Pick<BatchFooterProps, "batch" | "errors" | "isStaff" | "onReveal">;

type BrakeErrorProps = {
  brake: BrakeNotice;
};

const ANALYZER_SUBMISSIONS_WINDOW_HOURS = 32;
const MS_PER_SECOND = 1000;
const CHECK_TEXT_CLASS = "min-w-0 truncate text-[13px] leading-[18px] text-muted-foreground";

function BrakeError({ brake }: BrakeErrorProps) {
  const { t } = useTranslation();
  const { limit, waitSeconds } = brake;

  return (
    <InlineError
      title={t("cellAnalyzer:batch.allowanceRule", { limit, hours: ANALYZER_SUBMISSIONS_WINDOW_HOURS })}
      description={
        waitSeconds === null
          ? t("cellAnalyzer:batch.allowanceWaitUnknown")
          : t("cellAnalyzer:batch.allowanceWait", { wait: formatAllowanceWait(waitSeconds * MS_PER_SECOND, t) })
      }
    />
  );
}

function needsFieldSelection(batch: AnalyzerBatch): boolean {
  return (
    batch.view.stationCount === 0 &&
    batch.review.excludedFields.size > 0 &&
    batch.view.stations.some((station) => !station.isRemoved && station.keptRowCount > 0)
  );
}

function getCheckText(batch: AnalyzerBatch, isStaff: boolean, t: TFunction): string | null {
  const { view, busy, allowance, sendBlock } = batch;

  if (busy === "apply") {
    return t("cellAnalyzer:batch.savingChanges", {
      count: view.changeCount,
      stations: t("cellAnalyzer:batch.onStations", { count: view.stationCount }),
    });
  }
  if (busy === "send") return t("cellAnalyzer:batch.sendingSubmissions", { count: view.submit.itemCount });
  if (batch.refusals.length > 0) return t("cellAnalyzer:batch.nothingSaved");
  if (view.problems.length > 0) {
    const hasOnlyConflicts = view.problems.every((problem) => problem.kind === "conflict");
    return hasOnlyConflicts ? t("cellAnalyzer:batch.fixConflicts") : t("cellAnalyzer:batch.fixProblems");
  }
  if (needsFieldSelection(batch)) return t("submissions:batch.nothingSelectedTitle");
  if (view.stationCount === 0) return t("submissions:batch.noStations");
  if (isStaff && batch.applyBlock === "overStationCap") {
    return t("cellAnalyzer:selection.reviewBatchDisabledOverLimit", { count: APPLY_STATION_CAP });
  }
  if (isStaff) return batch.applyBlock === "outsideArea" ? t("cellAnalyzer:batch.outsideAreaTitle") : null;
  if (batch.brake !== null) return t("cellAnalyzer:batch.changesStay");
  if (sendBlock === "closedCountry") return t("cellAnalyzer:batch.closedCountryCheck");
  if (sendBlock === "overAllowance" && allowance.status === "limited") {
    return t("cellAnalyzer:selection.reviewBatchDisabledOverLimit", { count: allowance.remaining });
  }
  return sendBlock === "nothing" ? t("submissions:batch.noStations") : null;
}

function BatchCheck({ batch, errors, isStaff, onReveal }: BatchCheckProps) {
  const { t } = useTranslation();
  const { view } = batch;
  const hasRefusals = batch.refusals.length > 0;
  const checkText = getCheckText(batch, isStaff, t);
  const stationsText = t("common:labels.stations", { count: view.stationCount });
  const summary = `${stationsText}, ${t("stations:edit.frame.changeCount", { count: view.changeCount })}`;

  function toErrorRow(error: BatchErrorItem, closeAfterPick: () => void): ErrorRowItem {
    const row: ErrorRowItem = { id: error.id, where: error.where, message: error.message };
    if (error.stationId === null) return row;

    row.onPick = () => {
      onReveal(error);
      closeAfterPick();
    };
    return row;
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <ErrorsChipShell
        count={batch.busy === null ? errors.length : 0}
        title={hasRefusals ? t("cellAnalyzer:batch.refusedTitle") : t("cellAnalyzer:batch.errorsTitle")}
        openRequest={batch.errorsOpenRequest}
        align="start"
      >
        {(closeAfterPick) => <ErrorRows items={errors.map((error) => toErrorRow(error, closeAfterPick))} className={CHIP_LIST_CLASS} />}
      </ErrorsChipShell>
      {checkText === null ? (
        <span className="flex min-w-0 items-center gap-2 text-[13px] leading-[18px]">
          <HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="font-medium">{t("cellAnalyzer:batch.ready")}</span>
          <span className={CHECK_TEXT_CLASS}>{summary}</span>
        </span>
      ) : (
        <span aria-live="polite" className={CHECK_TEXT_CLASS}>
          {checkText}
        </span>
      )}
    </div>
  );
}

export function BatchFooter({ batch, errors, isStaff, isPhone, areSubmissionsOn, onReveal }: BatchFooterProps) {
  const { t } = useTranslation();
  const { view, allowance, busy, sendBlock, applyBlock } = batch;
  const isSending = busy === "send";
  const noteLabel = t("cellAnalyzer:batch.noteLabel");
  const selectionReason = needsFieldSelection(batch) ? t("submissions:batch.nothingSelectedDescription") : undefined;
  const closedCountryReason = sendBlock === "closedCountry" ? t("cellAnalyzer:batch.closedCountry") : selectionReason;
  let applyReason = selectionReason;
  if (applyBlock === "outsideArea") applyReason = t("cellAnalyzer:batch.outsideAreaTitle");
  else if (applyBlock === "overStationCap") applyReason = t("cellAnalyzer:selection.reviewBatchDisabledOverLimit", { count: APPLY_STATION_CAP });

  const staffButtons: ReactNode = (
    <>
      {areSubmissionsOn ? (
        <SendNotePopover
          label={isPhone ? t("cellAnalyzer:batch.sendAsSubmissionsShort") : t("cellAnalyzer:batch.sendAsSubmissions")}
          note={batch.note}
          leftOutConfirmCount={view.submit.leftOutConfirmCount}
          isDisabled={sendBlock !== null}
          isSending={isSending}
          disabledReason={closedCountryReason}
          triggerClassName={isPhone ? FLOATING_SURFACE_CLASS : undefined}
          onNoteChange={batch.setNote}
          onSend={batch.send}
        />
      ) : null}
      <ApplyDialog
        stationCount={view.stationCount}
        changeCount={view.changeCount}
        isDisabled={applyBlock !== null}
        isApplying={busy === "apply"}
        disabledReason={applyReason}
        triggerClassName={isPhone ? FLOATING_PRIMARY_CLASS : "min-w-34"}
        onApply={batch.apply}
      />
    </>
  );
  const sendButton: ReactNode = (
    <Button
      type="button"
      disabled={sendBlock !== null}
      title={selectionReason}
      onClick={batch.send}
      className={cn("cursor-pointer font-semibold", isPhone ? FLOATING_PRIMARY_CLASS : "min-w-37.5")}
    >
      {isSending ? t("cellAnalyzer:batch.sending") : t("cellAnalyzer:batch.send")}
      {isSending ? <Spinner /> : <HugeiconsIcon icon={SentIcon} aria-hidden="true" />}
    </Button>
  );
  const buttons = isStaff ? staffButtons : sendButton;
  const allowanceLine =
    !isStaff && allowance.status === "limited" ? (
      <span className="shrink-0 text-xs leading-4 whitespace-nowrap text-muted-foreground">
        {t("cellAnalyzer:batch.allowanceLeft", { remaining: allowance.remaining, limit: allowance.limit })}
      </span>
    ) : null;
  const noteField = isStaff ? null : (
    <Input
      value={batch.note}
      onChange={(event) => batch.setNote(event.target.value)}
      aria-label={noteLabel}
      placeholder={t("submissions:batch.submitterNotePlaceholder")}
      maxLength={EDIT_LIMITS.submissionNote}
      disabled={busy !== null}
      className="h-8 w-85 max-w-full shrink max-md:w-full"
    />
  );
  const brakeError = isStaff || batch.brake === null ? null : <BrakeError brake={batch.brake} />;

  if (isPhone) {
    return (
      <div className="flex flex-col gap-2.5 px-1 pt-1 pb-28">
        {brakeError}
        <BatchCheck batch={batch} errors={errors} isStaff={isStaff} onReveal={onReveal} />
        {allowanceLine}
        {noteField}
        <TopBarActions>{buttons}</TopBarActions>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t bg-background">
      {brakeError === null ? null : <div className="px-4 pt-3">{brakeError}</div>}
      <div className="flex min-h-[57px] items-center gap-3 px-4 py-3">
        <BatchCheck batch={batch} errors={errors} isStaff={isStaff} onReveal={onReveal} />
        <div className="flex shrink-0 items-center gap-2">
          {allowanceLine}
          {noteField}
          {buttons}
        </div>
      </div>
    </div>
  );
}
