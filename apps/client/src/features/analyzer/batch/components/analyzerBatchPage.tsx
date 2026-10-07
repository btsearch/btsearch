import { ArrowLeft01Icon, Clock01Icon, InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { loadAnalyzerDraft } from "../../data/draftStore";
import type { AnalyzerDraft } from "../../model/draft";
import { toRowKey } from "../model/batchRows";
import type { BatchProblem } from "../model/batchView";
import { type BatchErrorItem, type BatchErrorTarget, BatchFooter } from "./batchFooter";
import { BatchHead, useBackToAnalyzer } from "./batchHead";
import { FieldsToSendPopover } from "./fieldsToSendPopover";
import { StationCardColumns, StationChangeCard } from "./stationChangeCard";
import { type StationReads, useAnalyzerBatch, useBatchStationReads } from "./useAnalyzerBatch";
import { WrittenView } from "./writtenView";
import { Button } from "@/components/ui/button";
import { ErrorState, PageErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useCellTexts } from "@/features/station-editing/components/cells/cellTexts";
import { type EditReference, retryEditLookups, useEditReference } from "@/features/station-editing/data/lookups";
import { CELL_ROW_ATTRIBUTE } from "@/features/station-editing/hooks/useCellNavigation";
import { CELL_NUMBER_LABELS } from "@/features/station-editing/model/ratFields";
import { useIsMobile } from "@/hooks/useMobile";

type AnalyzerBatchPageProps = {
  draftId: string | undefined;
  role: string | null | undefined;
};

type BatchGateProps = {
  draft: AnalyzerDraft;
  role: string | null | undefined;
};

type LoadedBatchProps = {
  draft: AnalyzerDraft;
  reference: EditReference;
  stationReads: StationReads;
  isStaff: boolean;
  isAdmin: boolean;
  areSubmissionsOn: boolean;
};

type BatchNoticeProps = {
  kind: "expired" | "submissionsOff";
};

const PAGE_CLASS = "flex min-h-0 flex-1 flex-col overflow-hidden";
const STATION_ATTRIBUTE = "data-batch-station";
const SKELETON_CARDS = ["first", "second", "third"] as const;

function BatchNotice({ kind }: BatchNoticeProps) {
  const { t } = useTranslation();
  const goBack = useBackToAnalyzer();
  const isExpired = kind === "expired";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-3 md:p-4">
      <ErrorState
        tone="neutral"
        icon={isExpired ? Clock01Icon : InformationCircleIcon}
        title={isExpired ? t("cellAnalyzer:batch.expiredTitle") : t("cellAnalyzer:batch.submissionsOffTitle")}
        description={isExpired ? t("cellAnalyzer:batch.expiredText") : t("cellAnalyzer:batch.submissionsOffText")}
        action={
          <Button type="button" variant="outline" size="sm" onClick={goBack} className="cursor-pointer">
            <HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden="true" />
            {t("submissions:batch.backToAnalyzer")}
          </Button>
        }
      />
    </div>
  );
}

function BatchSkeleton() {
  const { t } = useTranslation();

  return (
    <div aria-busy="true" aria-label={t("submissions:batch.loading")} className={PAGE_CLASS}>
      <div className="space-y-2 border-b px-4 py-3">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-7 w-72 max-w-full" />
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-hidden p-3">
        {SKELETON_CARDS.map((card) => (
          <Skeleton key={card} className="h-44 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function LoadedBatch({ draft, reference, stationReads, isStaff, isAdmin, areSubmissionsOn }: LoadedBatchProps) {
  const { t } = useTranslation();
  const isPhone = useIsMobile();
  const batch = useAnalyzerBatch({ draft, reference, stationReads, isStaff, isAdmin });
  const texts = useCellTexts("review");
  const goBack = useBackToAnalyzer(draft.returnSearch);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { view, written } = batch;
  const showsCountry = view.countryCount > 1;

  if (written !== null) {
    return (
      <div className={PAGE_CLASS}>
        <BatchHead
          draft={draft}
          stationCount={written.stationCount}
          changeCount={written.changeCount}
          isWritten
          hasRemovals={false}
          isLocked
          onRestoreAll={() => batch.changeReview({ type: "restoreAll" })}
        />
        <WrittenView result={written} reference={reference} isPhone={isPhone} showsCountry={showsCountry} onBack={goBack} />
      </div>
    );
  }
  if (batch.loadStatus === "failed") {
    return (
      <PageErrorState
        title={t("submissions:batch.loadErrorTitle")}
        description={t("common:error.loadDescription")}
        onRetry={batch.retryLoad}
        isRetrying={batch.isRetryingLoad}
      />
    );
  }
  if (batch.loadStatus === "loading") return <BatchSkeleton />;

  const isLocked = batch.busy !== null;
  const includedRowCount = view.stations.reduce((total, station) => total + station.activeRows.length, 0);
  const keptRowCount = view.stations.reduce((total, station) => total + (station.isRemoved ? 0 : station.keptRowCount), 0);
  const siteIds = new Map(view.stations.map((station) => [station.station.id, station.station.siteId]));

  function describeWhere(stationId: number | null, rowIndex: number | null): string {
    const siteId = stationId === null ? undefined : siteIds.get(stationId);
    if (siteId === undefined) return t("cellAnalyzer:batch.wholeBatch");
    if (rowIndex === null) return t("cellAnalyzer:batch.stationLabel", { siteId });
    return t("cellAnalyzer:batch.stationRowWhere", { siteId, row: rowIndex + 1 });
  }

  function describeProblem(problem: BatchProblem): string {
    if (problem.kind === "stationGone") return t("stations:edit.refusals.stationGone");
    if (problem.kind === "bandMissing") return t("submissions:batch.bandNotMatched");
    return t("cellAnalyzer:batch.conflict", { row: problem.conflict.rival + 1, field: CELL_NUMBER_LABELS[problem.conflict.field] });
  }

  function reveal(target: BatchErrorTarget) {
    const root = scrollRef.current;
    if (root === null || target.stationId === null) return;

    const row = target.rowIndex === null ? null : root.querySelector(`[${CELL_ROW_ATTRIBUTE}="${toRowKey(target.rowIndex)}"]`);
    const element = row ?? root.querySelector(`[${STATION_ATTRIBUTE}="${target.stationId}"]`);
    element?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  const refusalItems = batch.refusals.map((refusal, position): BatchErrorItem => {
    const rowIndex = refusal.rowIndexes.at(0) ?? null;
    return {
      id: `refusal:${position}`,
      stationId: refusal.stationId,
      rowIndex,
      where: describeWhere(refusal.stationId, rowIndex),
      message: t(refusal.messageKey, refusal.values),
    };
  });
  const problemItems = view.problems.map((problem): BatchErrorItem => ({
    id: `${problem.kind}:${problem.stationId}:${problem.rowIndex ?? ""}`,
    stationId: problem.stationId,
    rowIndex: problem.rowIndex,
    where: describeWhere(problem.stationId, problem.rowIndex),
    message: describeProblem(problem),
  }));
  const footer = (
    <BatchFooter
      batch={batch}
      errors={refusalItems.length > 0 ? refusalItems : problemItems}
      isStaff={isStaff}
      isPhone={isPhone}
      areSubmissionsOn={areSubmissionsOn}
      onReveal={reveal}
    />
  );

  return (
    <div className={PAGE_CLASS}>
      <BatchHead
        draft={draft}
        stationCount={view.stationCount}
        changeCount={view.changeCount}
        isWritten={false}
        hasRemovals={view.hasRemovals}
        isLocked={isLocked}
        onRestoreAll={() => batch.changeReview({ type: "restoreAll" })}
      />
      <div ref={scrollRef} className="@container min-h-0 flex-1 overflow-y-auto px-3 pt-3 max-md:px-2 max-md:pt-2.5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 max-md:mb-2.5">
          <span className="text-xs text-muted-foreground">
            {t("submissions:batch.includedCellCount", { included: includedRowCount, total: keptRowCount })}
          </span>
          <FieldsToSendPopover
            stations={view.stations}
            excludedFields={batch.review.excludedFields}
            isLocked={isLocked}
            onChange={batch.changeReview}
          />
          {includedRowCount === 0 && keptRowCount > 0 && batch.review.excludedFields.size > 0 ? (
            <p className="w-full text-xs leading-4 text-muted-foreground">{t("submissions:batch.nothingSelectedDescription")}</p>
          ) : null}
        </div>
        <StationCardColumns
          items={view.stations}
          renderCard={(station) => (
            <div key={station.station.id} data-batch-station={station.station.id}>
              <StationChangeCard
                view={station}
                reference={reference}
                refusals={batch.refusals}
                texts={texts}
                isStaff={isStaff}
                isPhone={isPhone}
                isLocked={isLocked}
                showsCountry={showsCountry}
                onChange={batch.changeReview}
              />
            </div>
          )}
        />
        {isPhone ? footer : null}
      </div>
      {isPhone ? null : footer}
    </div>
  );
}

function BatchGate({ draft, role }: BatchGateProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const reference = useEditReference();
  const isAdmin = role === "admin";
  const isStaff = isAdmin || role === "editor";
  const areSubmissionsOn = reference.features !== null && reference.features.submissions;
  const stationReads = useBatchStationReads(draft, isStaff || areSubmissionsOn);

  if (!reference.isReady && reference.hasFailed) {
    return (
      <PageErrorState
        title={t("submissions:batch.loadErrorTitle")}
        description={t("submissions:batch.loadErrorDescription")}
        onRetry={() => retryEditLookups(queryClient, null, reference)}
      />
    );
  }
  if (!reference.isReady) return <BatchSkeleton />;
  if (!areSubmissionsOn && !isStaff) return <BatchNotice kind="submissionsOff" />;

  return (
    <LoadedBatch
      draft={draft}
      reference={reference}
      stationReads={stationReads}
      isStaff={isStaff}
      isAdmin={isAdmin}
      areSubmissionsOn={areSubmissionsOn}
    />
  );
}

export function AnalyzerBatchPage({ draftId, role }: AnalyzerBatchPageProps): ReactElement {
  const [loaded] = useState(() => loadAnalyzerDraft(draftId));

  if (loaded.status === "missing") return <BatchNotice kind="expired" />;
  return <BatchGate draft={loaded.draft} role={role} />;
}
