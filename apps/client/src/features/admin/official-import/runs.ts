import {
  type DryRunSlice,
  IMPORT_CHANGE_KINDS,
  IMPORT_RUN_STEPS,
  type ImportChangeKind,
  type ImportRun,
  type ImportRunApproval,
  type ImportRunChangeCount,
  type ImportRunCreate,
  type ImportRunDetail,
  type ImportRunList,
  type ImportRunSkipCount,
  type ImportRunStatus,
  type ImportRunStep,
  type ImportSliceOutcome,
  type OfficialSource,
} from "@openbts/shared/contract";
import { formatPermitLabel } from "@openbts/shared/permitLabel";

export type RunOutcome = "queued" | "running" | "success" | "completedWithErrors" | "held" | "error" | "cancelled";
export type StepStatus = "pending" | "running" | "success" | "unchanged" | "held" | "skipped" | "stopped" | "error";
export type ImportOverview = { latest: ImportRunDetail | null; liveRuns: ImportRun[] };
export type HeldSlice = { sliceKey: string; releaseRecordCount: number; storedRecordCount: number; approval: ImportRunApproval | null };
export type RunDatasetRow = {
  datasetKey: string;
  status: StepStatus;
  error: string | null;
  sliceCounts: Record<ImportSliceOutcome, number>;
  changes: ImportRunChangeCount[];
  skips: ImportRunSkipCount[];
  heldSlices: HeldSlice[];
};
export type RunStepRow = ImportRunStep & { status: StepStatus };
export type DatasetSelectionOverrides = Readonly<Record<number, boolean>>;

type ImportSchedule = { minHours: number; maxHours: number };
type ImportDayGroup = { key: number; label: string; runs: ImportRun[] };
type SliceWithApproval = DryRunSlice & { approval: ImportRunApproval | null };
type Translate = (key: string) => string;

export const RUN_STATUS_OUTCOME = {
  queued: "queued",
  running: "running",
  done: "success",
  failed: "error",
  cancelled: "cancelled",
} as const satisfies Record<ImportRunStatus, RunOutcome>;

const DATASET_LABEL_KEYS = new Map([
  ["permits", "officialImport.datasets.permits"],
  ["device-registry", "officialImport.datasets.deviceRegistry"],
  ["microwave-links", "officialImport.datasets.microwaveLinks"],
]);

const KNOWN_SKIP_REASONS: ReadonlySet<string> = new Set([
  "badCoordinates",
  "missingSiteId",
  "missingLicensee",
  "unknownLabel",
  "unknownDecisionType",
  "unknownRegion",
  "unmappedLicensee",
  "siteIdTooLong",
  "decisionNumberTooLong",
  "badLabel",
  "duplicateLink",
]);

const BAND_SLICE_KEY = /^([^:]+):(\d+):([^:]+)$/;
const DAY_MS = 24 * 60 * 60 * 1000;

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
const relativeDayFormatters = new Map<string, Intl.RelativeTimeFormat>();

export function getCachedFormatter<T>(cache: Map<string, T>, locale: string, create: () => T): T {
  let formatter = cache.get(locale);
  if (!formatter) {
    formatter = create();
    cache.set(locale, formatter);
  }
  return formatter;
}

export function getDatasetLabel(datasetKey: string, t: Translate): string {
  const labelKey = DATASET_LABEL_KEYS.get(datasetKey);
  return labelKey === undefined ? datasetKey : t(labelKey);
}

export function getSkipReasonLabel(reason: string, t: Translate): string {
  return KNOWN_SKIP_REASONS.has(reason) ? t(`officialImport.skipReasons.${reason}`) : reason;
}

export function getSliceLabel(sliceKey: string): string {
  const band = BAND_SLICE_KEY.exec(sliceKey);
  if (!band) return sliceKey;

  const [, rat = "", mhz = "", variant = ""] = band;
  return formatPermitLabel({ rat, mhz: Number(mhz), variant });
}

export function isRunLive(run: Pick<ImportRun, "status"> | null | undefined): boolean {
  return run?.status === "queued" || run?.status === "running";
}

export function getRunOutcome(run: ImportRun | ImportRunDetail): RunOutcome {
  if (run.status !== "done") return RUN_STATUS_OUTCOME[run.status];

  const report = "dryRunReport" in run ? run.dryRunReport : null;
  if (run.datasets.some((dataset) => dataset.error !== null) || (report !== null && report.failedDatasets.length > 0)) return "completedWithErrors";
  if (run.hasHeldSlices || (report !== null && report.slices.some((slice) => slice.outcome === "held"))) return "held";
  return "success";
}

export function isFailureOutcome(outcome: RunOutcome): boolean {
  return outcome === "error" || outcome === "completedWithErrors";
}

export function getRunDurationMs(run: Pick<ImportRun, "startedAt" | "finishedAt">): number | null {
  if (run.startedAt === null || run.finishedAt === null) return null;

  const elapsed = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
}

function sumChanges(slices: readonly Pick<DryRunSlice, "changes">[]): ImportRunChangeCount[] {
  const totals = new Map<ImportChangeKind, number>();
  for (const { changes } of slices) {
    for (const { kind, count } of changes) totals.set(kind, (totals.get(kind) ?? 0) + count);
  }

  return IMPORT_CHANGE_KINDS.flatMap((kind) => {
    const count = totals.get(kind) ?? 0;
    return count > 0 ? [{ kind, count }] : [];
  });
}

function sumSkips(slices: readonly Pick<DryRunSlice, "skips">[]): ImportRunSkipCount[] {
  const totals = new Map<string, number>();
  for (const { skips } of slices) {
    for (const { reason, count } of skips) totals.set(reason, (totals.get(reason) ?? 0) + count);
  }

  return [...totals].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function listSlices(run: ImportRunDetail): SliceWithApproval[] {
  if (run.dryRunReport !== null) return run.dryRunReport.slices.map((slice) => ({ ...slice, approval: null }));

  return run.slices.map(({ datasetId, releaseSha256, ...slice }) => ({ ...slice, approval: { datasetId, sliceKey: slice.sliceKey, releaseSha256 } }));
}

function getDatasetStatus(run: ImportRunDetail, error: string | null, sliceCounts: RunDatasetRow["sliceCounts"]): StepStatus {
  if (error !== null) return "error";
  if (sliceCounts.held > 0) return "held";
  if (run.status === "queued") return "pending";
  if (run.status === "running" && run.steps.length === 0) return "running";
  if (sliceCounts.applied > 0) return "success";

  const wasReached = sliceCounts.unchanged > 0 || run.steps.length > 0 || run.status === "done";
  return wasReached ? "unchanged" : "skipped";
}

export function hasLostDryRunReport(run: ImportRunDetail): boolean {
  return run.isDryRun && run.status === "done" && run.dryRunReport === null;
}

export function getRunDatasetRows(run: ImportRunDetail): RunDatasetRow[] {
  if (hasLostDryRunReport(run)) return [];

  const slices = listSlices(run);
  const reportedFailures = new Map<string, string>(run.dryRunReport?.failedDatasets.map(({ datasetKey, error }) => [datasetKey, error]));

  return run.datasets.map((dataset) => {
    const datasetSlices = slices.filter((slice) => slice.datasetKey === dataset.datasetKey);
    const sliceCounts = { applied: 0, unchanged: 0, held: 0 };
    for (const slice of datasetSlices) sliceCounts[slice.outcome] += 1;
    const error = dataset.error ?? reportedFailures.get(dataset.datasetKey) ?? null;

    return {
      datasetKey: dataset.datasetKey,
      status: getDatasetStatus(run, error, sliceCounts),
      error,
      sliceCounts,
      changes: sumChanges(datasetSlices),
      skips: sumSkips(datasetSlices),
      heldSlices: datasetSlices
        .filter((slice) => slice.outcome === "held")
        .map(({ sliceKey, releaseRecordCount, storedRecordCount, approval }) => ({ sliceKey, releaseRecordCount, storedRecordCount, approval })),
    };
  });
}

export function getChangesOutsideSlices(run: ImportRunDetail): ImportRunChangeCount[] {
  if (run.dryRunReport !== null) return run.dryRunReport.changesOutsideSlices;

  const sliceChanges = new Map(sumChanges(run.slices).map(({ kind, count }) => [kind, count]));
  return run.changes.flatMap(({ kind, count }) => {
    const outsideSlices = count - (sliceChanges.get(kind) ?? 0);
    return outsideSlices > 0 ? [{ kind, count: outsideSlices }] : [];
  });
}

function getStepStatus(step: ImportRunStep, runStatus: ImportRunStatus): StepStatus {
  if (step.error !== null) return "error";
  if (step.finishedAt !== null) return "success";
  if (runStatus === "running") return "running";
  return runStatus === "queued" ? "pending" : "stopped";
}

export function getRunStepRows(run: ImportRunDetail): RunStepRow[] {
  const awaitsSteps = isRunLive(run) && !run.isDryRun;

  return IMPORT_RUN_STEPS.flatMap((name): RunStepRow[] => {
    const step = run.steps.find((candidate) => candidate.step === name);
    if (step) return [{ ...step, status: getStepStatus(step, run.status) }];
    return awaitsSteps ? [{ step: name, status: "pending", startedAt: null, finishedAt: null, error: null }] : [];
  });
}

export function getAttentionDatasetKeys(run: ImportRunDetail): string[] {
  return getRunDatasetRows(run)
    .filter((dataset) => dataset.status === "error" || dataset.status === "held")
    .map((dataset) => dataset.datasetKey);
}

function listOverviewRuns(overview: ImportOverview): ImportRun[] {
  return overview.latest ? [overview.latest, ...overview.liveRuns] : overview.liveRuns;
}

function listLiveRuns(overview: ImportOverview): ImportRun[] {
  return listOverviewRuns(overview).filter(isRunLive);
}

export function isImportInProgress(overview: ImportOverview | undefined): boolean {
  return overview !== undefined && listLiveRuns(overview).length > 0;
}

export function isSourceImporting(overview: ImportOverview | undefined, sourceKey: string): boolean {
  return overview !== undefined && listLiveRuns(overview).some((run) => run.sourceKey === sourceKey && run.kind === "import");
}

function describeRunList(overview: ImportOverview): string {
  return listOverviewRuns(overview)
    .map((run) => `${run.id}:${run.status}`)
    .join("|");
}

export function hasRunListChanged(previous: ImportOverview | undefined, next: ImportOverview): boolean {
  return previous !== undefined && describeRunList(previous) !== describeRunList(next);
}

export function hasAppliedRunEnded(previous: ImportOverview | undefined, next: ImportOverview): boolean {
  if (previous === undefined) return false;

  const liveRunIds = new Set(listLiveRuns(next).map((run) => run.id));
  const hasLiveRunEnded = listLiveRuns(previous).some((run) => !run.isDryRun && !liveRunIds.has(run.id));

  const latest = next.latest;
  const hasNewRunEnded = latest !== null && !latest.isDryRun && !isRunLive(latest) && latest.id !== previous.latest?.id;

  return hasLiveRunEnded || hasNewRunEnded;
}

export function getSelectedDatasetIds(source: OfficialSource, overrides: DatasetSelectionOverrides): number[] {
  return source.datasets.filter((dataset) => overrides[dataset.id] ?? dataset.isEnabled !== false).map((dataset) => dataset.id);
}

export function buildStartRunBody(sourceKey: string, datasetIds: readonly number[], isDryRun: boolean): ImportRunCreate {
  return { sourceKey, datasetIds: [...datasetIds], isDryRun };
}

export function buildApprovalRunBody(sourceKey: string, approval: ImportRunApproval): ImportRunCreate {
  return { sourceKey, datasetIds: [approval.datasetId], approvals: [approval] };
}

export function getRunSourceLabel(sources: readonly OfficialSource[], sourceKey: string): string | null {
  if (sources.length < 2) return null;
  return sources.find((source) => source.key === sourceKey)?.shortName ?? sourceKey;
}

export function getImportSchedule(sources: readonly OfficialSource[]): ImportSchedule | null {
  const intervals = sources
    .filter((source) => source.isEnabled === true)
    .flatMap((source) => source.datasets)
    .flatMap((dataset) => (dataset.isEnabled === true && dataset.checkEveryHours ? [dataset.checkEveryHours] : []));
  if (intervals.length === 0) return null;

  return { minHours: Math.min(...intervals), maxHours: Math.max(...intervals) };
}

export function listPreviousRuns(pages: readonly Pick<ImportRunList, "data">[] | undefined, latestRunId: string | undefined): ImportRun[] {
  return (pages ?? []).flatMap((page) => page.data).filter((run) => run.id !== latestRunId);
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function groupImportRunsByDay(runs: readonly ImportRun[], locale: string, now = new Date()): ImportDayGroup[] {
  const today = startOfLocalDay(now);
  const relativeDays = getCachedFormatter(relativeDayFormatters, locale, () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }));
  const days = getCachedFormatter(dayFormatters, locale, () => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }));
  const groups = new Map<number, ImportDayGroup>();

  for (const run of runs) {
    const queuedAt = new Date(run.createdAt);
    const day = startOfLocalDay(queuedAt);
    const group = groups.get(day);
    if (group) {
      group.runs.push(run);
      continue;
    }

    const daysAgo = Math.round((today - day) / DAY_MS);
    const label = daysAgo === 0 || daysAgo === 1 ? relativeDays.format(-daysAgo || 0, "day") : days.format(queuedAt);
    groups.set(day, { key: day, label, runs: [run] });
  }

  return [...groups.values()];
}
