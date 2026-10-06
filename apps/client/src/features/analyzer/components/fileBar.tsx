import { File02Icon, RefreshIcon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type DragEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AnalysisState, AnalyzerFile } from "../model/types";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/error-state";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ANALYZER_MAX_CELLS } from "@/lib/analyzer/analyzerImport";
import { getAnalyzerFormatLabel } from "@/lib/analyzer/analyzerParsers";
import { formatDuration, formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

export type FileReading = {
  name: string;
  bytesRead: number;
  totalBytes: number;
};

export type ReadFailure = {
  fileName: string;
  kind: "failed" | "noRows" | "tooMany";
  cellCount: number | null;
};

type FileDrop = {
  isDragging: boolean;
  dropProps: {
    onDragOver: (event: DragEvent) => void;
    onDragLeave: (event: DragEvent) => void;
    onDrop: (event: DragEvent) => void;
  };
};

type ReadFailureNoteProps = {
  failure: ReadFailure;
  hasPreviousFile: boolean;
  className?: string;
  onPickFile: () => void;
};

type DropZoneProps = {
  onPickFile: () => void;
  onDropFile: (file: File) => void;
};

type ProgressLineProps = {
  label: string;
  value: number;
  max: number;
};

type BarProgressProps = {
  reading: FileReading | null;
  analysis: AnalysisState;
};

type FileBarProps = {
  file: AnalyzerFile | null;
  analysis: AnalysisState;
  analyzedAt: number | null;
  reading: FileReading | null;
  failure: ReadFailure | null;
  isCompact: boolean;
  onPickFile: () => void;
  onDropFile: (file: File) => void;
  onCancelRead: () => void;
  onAnalyze: () => void;
};

const ELAPSED_STEP_MS = 500;
const SMALLEST_PROGRESS_MAX = 1;
const WHOLE = 100;
const FACT_SEPARATOR = " · ";
const CLOCK_TIME_FORMAT: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
const BAR_CLASS = "flex shrink-0 flex-col overflow-hidden rounded-lg border transition-colors";
const BAR_TONE_CLASSES = { plain: "border-input dark:bg-input/30", dragging: "border-primary bg-primary/5" };
const FACTS_CLASS = "text-[13px] leading-5 whitespace-nowrap text-muted-foreground";
const DROP_ZONE_CLASS = cn(
  "flex min-h-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed p-8 text-center",
  "outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
);
const DROP_ZONE_TONE_CLASSES = {
  plain: "border-border bg-muted/20 hover:border-primary/60 hover:bg-primary/5",
  dragging: "border-primary bg-primary/5",
};

function formatClockTime(time: number, language: string): string {
  return new Date(time).toLocaleTimeString(language, CLOCK_TIME_FORMAT);
}

function useFileDrop(isDisabled: boolean, onDropFile: (file: File) => void): FileDrop {
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (!isDisabled) setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent) {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    setIsDragging(false);
    if (isDisabled) return;

    const file = event.dataTransfer.files.item(0);
    if (file !== null) onDropFile(file);
  }

  return { isDragging: isDragging && !isDisabled, dropProps: { onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop } };
}

export function ReadFailureNote({ failure, hasPreviousFile, className, onPickFile }: ReadFailureNoteProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { fileName, kind, cellCount } = failure;
  let title = t("file.readFailed", { name: fileName });
  let description: string | undefined = hasPreviousFile ? t("file.keptPrevious") : undefined;

  if (kind === "noRows") description = hasPreviousFile ? t("file.noRowsKept") : t("errors.noValidRows");
  if (kind === "tooMany") {
    title =
      cellCount === null
        ? t("errors.tooManyCells", { count: ANALYZER_MAX_CELLS })
        : t("file.tooMany", { name: fileName, count: cellCount, limit: ANALYZER_MAX_CELLS });
    description = hasPreviousFile ? t("file.tooManyHintKept") : t("file.tooManyHint");
  }

  return (
    <InlineError
      className={className}
      title={title}
      description={description}
      action={
        <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={onPickFile}>
          <HugeiconsIcon icon={Upload04Icon} data-icon="inline-start" aria-hidden="true" />
          {t("admin:reference.brands.logo.chooseAnother")}
        </Button>
      }
    />
  );
}

export function DropZone({ onPickFile, onDropFile }: DropZoneProps) {
  const { t } = useTranslation("cellAnalyzer");
  const { isDragging, dropProps } = useFileDrop(false, onDropFile);

  return (
    <button
      type="button"
      className={cn(DROP_ZONE_CLASS, isDragging ? DROP_ZONE_TONE_CLASSES.dragging : DROP_ZONE_TONE_CLASSES.plain)}
      onClick={onPickFile}
      {...dropProps}
    >
      <HugeiconsIcon icon={Upload04Icon} className={cn("mb-1.5 size-10", isDragging ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
      <span className="text-sm leading-5 font-medium">{t("file.dropHint")}</span>
      <span className="text-sm leading-5 text-muted-foreground">{t("file.constraints")}</span>
    </button>
  );
}

function ProgressLine({ label, value, max }: ProgressLineProps) {
  const shownMax = Math.max(SMALLEST_PROGRESS_MAX, max);
  const percent = Math.min(WHOLE, (value / shownMax) * WHOLE);

  return (
    <div role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={shownMax} className="h-0.5 bg-muted">
      <div className="h-full bg-primary transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${percent}%` }} />
    </div>
  );
}

function BarProgress({ reading, analysis }: BarProgressProps) {
  const { t } = useTranslation("cellAnalyzer");

  if (reading !== null) return <ProgressLine label={t("file.readProgress")} value={reading.bytesRead} max={reading.totalBytes} />;
  if (analysis.phase !== "running") return null;
  return <ProgressLine label={t("file.analysisProgress")} value={analysis.doneChunks} max={analysis.chunkCount} />;
}

function AnalysisTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), ELAPSED_STEP_MS);
    return () => window.clearInterval(timer);
  }, []);

  return <span className="text-xs tabular-nums opacity-75">{formatDuration(Math.max(0, now - startedAt))}</span>;
}

function FileFacts({ file }: { file: AnalyzerFile }) {
  const { t } = useTranslation("cellAnalyzer");
  const facts = [getAnalyzerFormatLabel(file.format), t("common:labels.cells", { count: file.rowCount })];
  if (file.skippedCount > 0) facts.push(t("file.skipped", { count: file.skippedCount }));

  return <>{facts.join(FACT_SEPARATOR)}</>;
}

function FileName({ name, className }: { name: string; className?: string }) {
  return (
    <>
      <HugeiconsIcon icon={File02Icon} className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span title={name} className={cn("min-w-0 truncate text-sm leading-5 font-semibold", className)}>
        {name}
      </span>
    </>
  );
}

export function FileBar({ file, analysis, analyzedAt, reading, failure, isCompact, onPickFile, onDropFile, onCancelRead, onAnalyze }: FileBarProps) {
  const { t, i18n } = useTranslation("cellAnalyzer");
  const isRunning = analysis.phase === "running";
  const isReading = reading !== null;
  const { isDragging, dropProps } = useFileDrop(isRunning, onDropFile);
  const shownName = reading?.name ?? file?.name ?? "";
  const analyzedText =
    analyzedAt === null || isReading || isRunning ? null : t("file.analyzedAt", { time: formatClockTime(analyzedAt, i18n.language) });
  const hasAnalyzeButton = !isReading && file !== null && analyzedText === null;
  const analyzeAgainLabel = t("file.analyzeAgain");

  const changeFileButton = (
    <Button type="button" variant="outline" size="sm" disabled={isRunning} className="shrink-0 cursor-pointer" onClick={onPickFile}>
      <HugeiconsIcon icon={Upload04Icon} data-icon="inline-start" aria-hidden="true" />
      {t("file.changeFile")}
    </Button>
  );
  const cancelButton = (
    <Button type="button" variant="outline" size="sm" className="shrink-0 cursor-pointer" onClick={onCancelRead}>
      {t("common:actions.cancel")}
    </Button>
  );
  const analyzeButton =
    analysis.phase === "running" ? (
      <Button type="button" size="sm" disabled className="min-w-22 shrink-0 font-semibold">
        <Spinner data-icon="inline-start" className="size-3.5 text-current" />
        {t("button.analyzing")}
        <AnalysisTimer startedAt={analysis.startedAt} />
      </Button>
    ) : (
      <Button type="button" size="sm" className="min-w-22 shrink-0 font-semibold" onClick={onAnalyze}>
        {t("file.analyze")}
      </Button>
    );
  const readingFacts =
    reading === null ? null : (
      <>
        <Spinner className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate tabular-nums">
          {t("file.parsing")}
          {FACT_SEPARATOR}
          {formatFileSize(reading.bytesRead)} / {formatFileSize(reading.totalBytes)}
        </span>
      </>
    );

  const progress = <BarProgress reading={reading} analysis={analysis} />;
  const failureNote =
    failure === null || isReading ? null : (
      <div className="px-1 pb-1">
        <ReadFailureNote failure={failure} hasPreviousFile={file !== null} onPickFile={onPickFile} />
      </div>
    );
  const barClassName = cn(BAR_CLASS, isDragging ? BAR_TONE_CLASSES.dragging : BAR_TONE_CLASSES.plain);

  if (isCompact) {
    return (
      <div className={barClassName} {...dropProps}>
        <div className="flex min-w-0 flex-col gap-0.5 py-1.5 pr-1.5 pl-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileName name={shownName} className="flex-1" />
            {isReading ? cancelButton : changeFileButton}
          </div>
          <div className="flex min-h-7 min-w-0 items-center gap-2">
            {isReading ? (
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs leading-4 text-muted-foreground">{readingFacts}</span>
            ) : (
              <span className="min-w-0 flex-1 truncate text-xs leading-4 text-muted-foreground">
                {file === null ? null : <FileFacts file={file} />}
                {analyzedText === null ? null : `${FACT_SEPARATOR}${analyzedText}`}
              </span>
            )}
            {hasAnalyzeButton ? analyzeButton : null}
            {analyzedText === null ? null : (
              <Tooltip>
                <TooltipTrigger
                  aria-label={analyzeAgainLabel}
                  onClick={onAnalyze}
                  render={<Button type="button" variant="ghost" size="icon-sm" className="shrink-0 cursor-pointer" />}
                >
                  <HugeiconsIcon icon={RefreshIcon} aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>{analyzeAgainLabel}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        {progress}
        {failureNote}
      </div>
    );
  }

  return (
    <div className={barClassName} {...dropProps}>
      <div className="flex min-h-9 min-w-0 items-center gap-2 pr-1 pl-3">
        <FileName name={shownName} />
        {isReading ? (
          <span className={cn("flex min-w-0 items-center gap-1.5", FACTS_CLASS)}>{readingFacts}</span>
        ) : (
          <span className={cn("shrink-0", FACTS_CLASS)}>{file === null ? null : <FileFacts file={file} />}</span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
          {analyzedText === null ? null : (
            <>
              <span className="shrink-0 text-[12.5px] leading-4 whitespace-nowrap text-muted-foreground">{analyzedText}</span>
              <Button type="button" variant="ghost" size="sm" className="shrink-0 cursor-pointer" onClick={onAnalyze}>
                <HugeiconsIcon icon={RefreshIcon} data-icon="inline-start" aria-hidden="true" />
                {analyzeAgainLabel}
              </Button>
            </>
          )}
          {isReading ? cancelButton : changeFileButton}
          {hasAnalyzeButton ? analyzeButton : null}
        </div>
      </div>
      {progress}
      {failureNote}
    </div>
  );
}
