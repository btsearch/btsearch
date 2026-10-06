import { type ReactElement, useRef } from "react";
import { useTranslation } from "react-i18next";

import { analyzerSession } from "../data/session";
import type { AnalyzerSearch } from "../model/search";
import type { AnalysisState } from "../model/types";
import { ANALYZER_FRAME_CLASS, ANALYZER_NARROWEST_TABLE_WIDTHS } from "./analyzerLayout";
import { AnalyzerMobileFilters } from "./analyzerMobileFilters";
import { AnalyzerPanel } from "./analyzerPanel";
import { AnalyzerTable } from "./analyzerTable";
import { AnalyzerToolbar } from "./analyzerToolbar";
import { DropZone, FileBar, ReadFailureNote } from "./fileBar";
import { SelectionBar } from "./selectionBar";
import { useAnalyzerFileRead } from "./useAnalyzerFileRead";
import { type AnalyzerPageModel, useAnalyzerPage } from "./useAnalyzerPage";
import { InlineError } from "@/components/ui/error-state";
import { ListFrame } from "@/features/stations/list/components/frame/listFrame";

type AnalyzerPageProps = {
  search: AnalyzerSearch;
  onSearchChange: (search: AnalyzerSearch) => void;
};

type AnalysisFailureNoteProps = {
  analysis: AnalysisState;
  rowCount: number;
  onRetry: () => void;
};

type BandPlanFailureNoteProps = {
  isRetrying: boolean;
  onRetry: () => void;
};

const FILE_ACCEPT = ".ntm,.csv,.txt,.clf,.log,.gz,application/gzip,application/x-gzip";

function AnalysisFailureNote({ analysis, rowCount, onRetry }: AnalysisFailureNoteProps) {
  const { t } = useTranslation("cellAnalyzer");
  if (analysis.phase !== "failed") return null;

  const isRateLimited = analysis.cause === "rateLimited";
  const title = isRateLimited ? t("common:error.rateLimited") : t("errors.analysisFailed");
  let description = isRateLimited ? t("common:error.tryLater") : t("errors.analysisFailedHint");
  if (analysis.analyzedRowCount > 0) description = t("state.partlyAnalyzed", { done: analysis.analyzedRowCount, total: rowCount });

  return <InlineError className="shrink-0" title={title} description={description} onRetry={onRetry} />;
}

function BandPlanFailureNote({ isRetrying, onRetry }: BandPlanFailureNoteProps) {
  const { t } = useTranslation("cellAnalyzer");
  const title = t("errors.bandPlanFailed");
  const description = t("errors.bandPlanFailedHint");

  return <InlineError className="shrink-0" title={title} description={description} onRetry={onRetry} isRetrying={isRetrying} />;
}

function AnalyzerCount({ model }: { model: AnalyzerPageModel }) {
  const { t } = useTranslation("cellAnalyzer");
  const rowCount = model.session.rows.length;

  if (model.session.file === null) return model.isMobile ? null : t("page.description");
  if (model.activeFilterCount === 0) return t("common:labels.cells", { count: rowCount });
  return t("page.filteredCount", { shown: model.filteredCount, count: rowCount });
}

export function AnalyzerPage({ search, onSearchChange }: AnalyzerPageProps): ReactElement {
  const { t } = useTranslation("cellAnalyzer");
  const model = useAnalyzerPage({ search, onSearchChange });
  const { reading, failure, readFile, cancelRead } = useAnalyzerFileRead(model.showFirstPage);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { session, filters, panel, selection, isMobile } = model;
  const { file, analysis, results } = session;
  const isRunning = analysis.phase === "running";
  const hasFile = file !== null;
  const panelProps = { filters, panel, onFiltersChange: model.changeFilters };
  const column = file?.hasOneDescription === true ? "none" : "shown";

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function startReading(pickedFile: File) {
    void readFile(pickedFile);
  }

  let announcement = "";
  if (reading !== null) announcement = t("file.parsing");
  else if (isRunning) announcement = t("statusAnnouncement.analyzing");
  else if (results !== null) announcement = t("statusAnnouncement.complete", { count: results.length });

  const hasTicks = selection.summary.rowCount > 0;
  const selectionBarProps = {
    summary: selection.summary,
    stationCap: model.viewer.stationCap,
    problem: selection.problem,
    isPageTicked: model.page.mark === "on",
    onTickAllMatching: selection.tickAllMatching,
    onClear: selection.clear,
    onOpenBatch: selection.openBatch,
  };

  return (
    <ListFrame
      title={t("page.title")}
      count={<AnalyzerCount model={model} />}
      search={
        hasFile || reading !== null ? (
          <FileBar
            file={file}
            analysis={analysis}
            analyzedAt={session.analyzedAt}
            reading={reading}
            failure={failure}
            isCompact={isMobile}
            onPickFile={openFilePicker}
            onDropFile={startReading}
            onCancelRead={cancelRead}
            onAnalyze={analyzerSession.analyze}
          />
        ) : null
      }
      panel={hasFile ? <AnalyzerPanel {...panelProps} /> : null}
      mobileFilters={hasFile ? <AnalyzerMobileFilters {...panelProps} /> : undefined}
      mobileLead={hasFile && hasTicks ? <SelectionBar {...selectionBarProps} isCompact /> : null}
      activeFilterCount={model.activeFilterCount}
      onClearFilters={model.clearFilters}
      narrowestTableWidth={ANALYZER_NARROWEST_TABLE_WIDTHS[column]}
    >
      <div className={ANALYZER_FRAME_CLASS}>
        <input
          ref={fileInputRef}
          type="file"
          accept={FILE_ACCEPT}
          className="hidden"
          disabled={isRunning}
          onChange={(event) => {
            const pickedFile = event.target.files?.item(0) ?? null;
            event.currentTarget.value = "";
            if (pickedFile !== null) startReading(pickedFile);
          }}
        />
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
        {hasFile ? (
          <>
            <AnalysisFailureNote analysis={analysis} rowCount={session.rows.length} onRetry={analyzerSession.analyze} />
            {model.hasBandPlanError ? <BandPlanFailureNote isRetrying={panel.isRetryingLookups} onRetry={panel.retryLookups} /> : null}
            {isMobile ? null : (
              <AnalyzerToolbar
                filters={filters}
                hasResults={model.hasResults}
                selectionBar={hasTicks ? <SelectionBar {...selectionBarProps} /> : null}
                onFiltersChange={model.changeFilters}
              />
            )}
            <AnalyzerTable model={model} column={column} isReading={reading !== null} />
          </>
        ) : (
          <>
            {isMobile ? <p className="shrink-0 text-sm leading-5 text-muted-foreground">{t("page.description")}</p> : null}
            {failure === null || reading !== null ? null : (
              <ReadFailureNote className="shrink-0" failure={failure} hasPreviousFile={false} onPickFile={openFilePicker} />
            )}
            <DropZone onPickFile={openFilePicker} onDropFile={startReading} />
          </>
        )}
      </div>
    </ListFrame>
  );
}
