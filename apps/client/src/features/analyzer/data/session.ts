import { useSyncExternalStore } from "react";

import { findStoredCell, getTickState } from "../model/rows";
import type { AnalysisState, AnalyzerFile, LogRow, MatchFailure, MatchResults, MatchTables } from "../model/types";
import { type MatchRun, type MatchRunResult, countChunks, mergeMatchRun, runMatch } from "./matchRequest";

export type AnalyzerSession = {
  file: AnalyzerFile | null;
  rows: readonly LogRow[];
  results: MatchResults | null;
  tables: MatchTables;
  analysis: AnalysisState;
  selected: ReadonlySet<number>;
  analyzedAt: number | null;
};

type SessionListener = () => void;

const NO_TABLES: MatchTables = { stationsById: new Map(), cellsById: new Map(), officialSitesById: new Map() };
const NO_SELECTION: ReadonlySet<number> = new Set();
const EMPTY_RUN: MatchRun = { chunks: [] };
const EMPTY_SESSION: AnalyzerSession = {
  file: null,
  rows: [],
  results: null,
  tables: NO_TABLES,
  analysis: { phase: "idle" },
  selected: NO_SELECTION,
  analyzedAt: null,
};
const UNKNOWN_FAILURE: MatchFailure = "network";

const listeners = new Set<SessionListener>();
let session = EMPTY_SESSION;
let keptRun = EMPTY_RUN;
let activeController: AbortController | null = null;
let isStaffViewer = false;

function publish(next: AnalyzerSession): void {
  session = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: SessionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): AnalyzerSession {
  return session;
}

function keepTickableRows(selected: ReadonlySet<number>, results: MatchResults, tables: MatchTables): ReadonlySet<number> {
  const kept = new Set<number>();

  for (const index of selected) {
    const result = results[index] ?? null;
    if (getTickState(result, findStoredCell(result, tables), isStaffViewer).canTick) kept.add(index);
  }
  return kept.size === selected.size ? selected : kept;
}

function loadFile(file: AnalyzerFile, rows: readonly LogRow[]): void {
  activeController?.abort();
  activeController = null;
  keptRun = EMPTY_RUN;
  publish({ ...EMPTY_SESSION, file, rows });
}

function toFailedAnalysis(outcome: MatchRunResult, chunkCount: number, analyzedRowCount: number): AnalysisState {
  return { phase: "failed", missingChunks: outcome.missingChunks, chunkCount, cause: outcome.cause ?? UNKNOWN_FAILURE, analyzedRowCount };
}

function finishRun(rows: readonly LogRow[], outcome: MatchRunResult, startedAt: number): void {
  const chunkCount = countChunks(rows.length);
  const finishedAt = Date.now();
  keptRun = outcome.run;

  if (outcome.missingChunks.length === chunkCount) {
    publish({ ...session, analysis: toFailedAnalysis(outcome, chunkCount, 0) });
    return;
  }

  const { results, tables } = mergeMatchRun(outcome.run, rows.length);
  const selected = keepTickableRows(session.selected, results, tables);
  const analysis: AnalysisState =
    outcome.missingChunks.length === 0
      ? { phase: "done", finishedAt, durationMs: finishedAt - startedAt }
      : toFailedAnalysis(outcome, chunkCount, results.filter((result) => result !== null).length);
  publish({ ...session, results, tables, analysis, selected, analyzedAt: finishedAt });
}

async function runAnalysis(rows: readonly LogRow[], startRun: MatchRun, controller: AbortController, startedAt: number): Promise<void> {
  const chunkCount = countChunks(rows.length);

  function isCurrentRun(): boolean {
    return activeController === controller && !controller.signal.aborted;
  }

  function showProgress(doneChunks: number): void {
    if (isCurrentRun()) publish({ ...session, analysis: { phase: "running", doneChunks, chunkCount, startedAt } });
  }

  function giveUp(): MatchRunResult {
    return { run: startRun, missingChunks: Array.from({ length: chunkCount }, (_, index) => index), cause: UNKNOWN_FAILURE };
  }

  const outcome = await runMatch(rows, startRun, controller.signal, showProgress).catch(giveUp);
  if (!isCurrentRun()) return;

  activeController = null;
  finishRun(rows, outcome, startedAt);
}

function analyze(): void {
  const { rows, analysis } = session;
  if (rows.length === 0 || analysis.phase === "running") return;

  const startRun = analysis.phase === "failed" ? keptRun : EMPTY_RUN;
  const controller = new AbortController();
  const startedAt = Date.now();
  const chunkCount = countChunks(rows.length);
  const doneChunks = startRun.chunks.filter((chunk) => chunk !== null).length;

  activeController?.abort();
  activeController = controller;
  publish({ ...session, analysis: { phase: "running", doneChunks, chunkCount, startedAt } });
  void runAnalysis(rows, startRun, controller, startedAt);
}

function setSelected(selected: ReadonlySet<number>, isStaff: boolean): void {
  isStaffViewer = isStaff;
  publish({ ...session, selected });
}

function forgetRows(indexes: readonly number[]): void {
  const selected = new Set(session.selected);
  for (const index of indexes) selected.delete(index);
  if (selected.size !== session.selected.size) publish({ ...session, selected });
}

export function useAnalyzerSession(): AnalyzerSession {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export const analyzerSession = { loadFile, analyze, setSelected, forgetRows, getSnapshot };
