import { officialSourceByKey } from "@openbts/country-packs/sources";
import {
  OfficialChange,
  officialDatasets,
  officialImportChanges,
  officialImportRunApprovals,
  officialImportRunDatasets,
  officialImportRunSkips,
  officialImportRunSlices,
  officialImportRunSteps,
  officialImportRuns,
  officialRemapRuns,
  officialSnapshotSlices,
  officialSnapshots,
  officialSources,
  users,
} from "@openbts/drizzle";
import type {
  DryRunRemap,
  DryRunReport,
  ImportChangeKind,
  ImportRun,
  ImportRunChangeCount,
  ImportRunCreate,
  ImportRunDetail,
  ImportRunListQuery,
  ImportRunStepName,
} from "@openbts/shared/contract";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { FastifyRequest } from "fastify";
import { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { unique } from "../../lib/collections.js";
import { createKeyset } from "../../lib/keyset.js";
import type { DbTx } from "../../types/global.js";
import { type AuditMetadata, recordAuditOperation, standaloneAuditContext } from "../audit/index.js";
import { toUserRef } from "../users/userRef.js";
import { plannedAfterSteps } from "./import/afterSteps.js";
import { loadDryRunReport } from "./import/dryRunReports.js";
import type { RemapReport } from "./import/remap/apply.js";
import type { ChangeCountByKind, DryRunReport as StoredDryRunReport } from "./import/report.js";
import { type EnqueueRunInput, enqueueRun } from "./import/runs.js";
import { afterSteps } from "./import/steps/index.js";
import type { ChangeKind, RunStepName } from "./import/types.js";

const runSelectSchema = createSelectSchema(officialImportRuns);

export type RunRow = z.infer<typeof runSelectSchema>;
type StoredRun = { run: RunRow; sourceKey: string };
type RunParts = Awaited<ReturnType<typeof loadRunParts>>;
type SliceRef = { datasetId: number | null; slice: string | null };

const SORT = "-createdAt";
const SORT_COLUMNS = { createdAt: { column: officialImportRuns.createdAt, kind: "instant" } } as const;
const cursorIdSchema = z.uuid();

export const LIVE_RUN_STATES: RunRow["state"][] = ["queued", "running"];

const RUN_STEPS = {
  unlisted_permits: "unlistedPermits",
  site_notifications: "siteNotifications",
  links: "links",
  station_notifications: "stationNotifications",
  orphans: "orphans",
  statistics: "statistics",
  push: "push",
  kmz: "kmz",
  publish: "publish",
  prune: "prune",
} as const satisfies Record<RunStepName, ImportRunStepName>;

const CHANGE_KINDS = {
  site_added: "siteAdded",
  site_moved: "siteMoved",
  site_remapped: "siteRemapped",
  permit_added: "permitAdded",
  permit_listed: "permitListed",
  permit_unlisted: "permitUnlisted",
  permit_archived: "permitArchived",
  station_linked: "stationLinked",
  station_unlinked: "stationUnlinked",
  microwave_link_added: "microwaveLinkAdded",
  microwave_link_renewed: "microwaveLinkRenewed",
  microwave_link_archived: "microwaveLinkArchived",
} as const satisfies Record<ChangeKind, ImportChangeKind>;

function toSkipReason(reason: string): string {
  return reason.replace(/_([a-z0-9])/g, (_separator, character: string) => character.toUpperCase());
}

export function toChangeCounts(countByKind: ChangeCountByKind): ImportRunChangeCount[] {
  return OfficialChange.enumValues.flatMap((kind) => {
    const changes = countByKind[kind] ?? 0;
    return changes > 0 ? [{ kind: CHANGE_KINDS[kind], count: changes }] : [];
  });
}

export function tallyChanges(rows: readonly { kind: ChangeKind; changes: number }[]): ChangeCountByKind {
  const countByKind: ChangeCountByKind = {};
  for (const { kind, changes } of rows) countByKind[kind] = (countByKind[kind] ?? 0) + changes;

  return countByKind;
}

function storedRuns() {
  return db
    .select({ run: officialImportRuns, sourceKey: officialSources.key })
    .from(officialImportRuns)
    .innerJoin(officialSources, eq(officialSources.id, officialImportRuns.sourceId));
}

async function loadRunParts(runs: readonly RunRow[]) {
  const runIds = runs.map((run) => run.id);
  const requesterIds = unique(runs.map((run) => run.requestedById));
  const remapRunIds = runs.filter((run) => run.kind === "remap").map((run) => run.id);
  const [datasets, heldRuns, changes, requesters, remaps] = await Promise.all([
    db
      .select({
        runId: officialImportRunDatasets.runId,
        datasetId: officialImportRunDatasets.datasetId,
        datasetKey: officialDatasets.key,
        error: officialImportRunDatasets.error,
      })
      .from(officialImportRunDatasets)
      .innerJoin(officialDatasets, eq(officialDatasets.id, officialImportRunDatasets.datasetId))
      .where(inArray(officialImportRunDatasets.runId, runIds))
      .orderBy(asc(officialImportRunDatasets.datasetId)),
    db
      .select({ runId: officialImportRunSlices.runId })
      .from(officialImportRunSlices)
      .where(and(inArray(officialImportRunSlices.runId, runIds), eq(officialImportRunSlices.outcome, "held")))
      .groupBy(officialImportRunSlices.runId),
    db
      .select({
        runId: officialImportChanges.runId,
        datasetId: officialImportChanges.datasetId,
        slice: officialImportChanges.slice,
        kind: officialImportChanges.kind,
        changes: count(),
      })
      .from(officialImportChanges)
      .where(inArray(officialImportChanges.runId, runIds))
      .groupBy(officialImportChanges.runId, officialImportChanges.datasetId, officialImportChanges.slice, officialImportChanges.kind),
    requesterIds.length === 0
      ? []
      : db
          .select({ id: users.id, username: users.username, name: users.name, image: users.image })
          .from(users)
          .where(inArray(users.id, requesterIds)),
    remapRunIds.length === 0 ? [] : db.select().from(officialRemapRuns).where(inArray(officialRemapRuns.runId, remapRunIds)),
  ]);

  return {
    datasets,
    heldRunIds: new Set(heldRuns.map((held) => held.runId)),
    changes,
    requesters: new Map(requesters.map((user) => [user.id, toUserRef(user)])),
    remaps: new Map(remaps.map((remap) => [remap.runId, remap])),
  };
}

function toImportRun({ run, sourceKey }: StoredRun, parts: RunParts): ImportRun {
  const remap = parts.remaps.get(run.id);

  return {
    id: run.id,
    sourceKey,
    kind: run.kind,
    trigger: run.trigger,
    isDryRun: run.isDryRun,
    status: run.state,
    error: run.error,
    attempt: run.attempt,
    requester: run.requestedById === null ? null : (parts.requesters.get(run.requestedById) ?? null),
    remap: remap ? { licenseeId: remap.licenseeId, fromOperatorId: remap.fromOperatorId, toOperatorId: remap.toOperatorId } : null,
    datasets: parts.datasets
      .filter((dataset) => dataset.runId === run.id)
      .map(({ datasetId, datasetKey, error }) => ({ datasetId, datasetKey, error })),
    hasHeldSlices: parts.heldRunIds.has(run.id),
    changes: toChangeCounts(tallyChanges(parts.changes.filter((change) => change.runId === run.id))),
    createdAt: run.createdAt.toISOString(),
    startedAt: run.startedAt?.toISOString() ?? null,
    claimedAt: run.claimedAt?.toISOString() ?? null,
    heartbeatAt: run.heartbeatAt?.toISOString() ?? null,
    finishedAt: run.finishedAt?.toISOString() ?? null,
  };
}

function toDryRunRemap(remap: RemapReport): DryRunRemap {
  return {
    sitesRekeyed: remap.sitesRekeyed,
    sitesMerged: remap.sitesMerged,
    sitesSplit: remap.sitesSplit,
    permitsMoved: remap.permitsMoved,
    permitsMerged: remap.permitsMerged,
    permitsBlocked: remap.permitsBlocked.count,
    blockedPermitIds: remap.permitsBlocked.ids,
    listingsRemoved: remap.listingsRemoved,
    watchesRepointed: remap.watchesRepointed,
    notificationsRepointed: remap.notificationsRepointed,
    listsRepointed: remap.listsRepointed,
  };
}

function toDryRunReport(report: StoredDryRunReport): DryRunReport {
  return {
    slices: report.slices.map((slice) => ({
      datasetKey: slice.datasetKey,
      sliceKey: slice.slice,
      outcome: slice.outcome,
      releaseRecordCount: slice.stagedCount,
      storedRecordCount: slice.liveCount,
      changes: toChangeCounts(slice.changes),
      skips: Object.entries(slice.skipped).map(([reason, records]) => ({ reason: toSkipReason(reason), count: records })),
    })),
    failedDatasets: report.failedDatasets,
    changesOutsideSlices: toChangeCounts(report.afterStepChanges),
    stationNamesWritten: report.siteNames.written,
    stationNamesSkipped: report.siteNames.skipped,
    licenseeNamesCorrected: report.licenseeNamesCorrected,
    remap: report.remap ? toDryRunRemap(report.remap) : null,
  };
}

export async function fetchImportRunPage(query: ImportRunListQuery): Promise<{ data: ImportRun[]; nextCursor: string | null }> {
  const { sourceKeys, kinds, statuses, isDryRun, limit, cursor } = query;
  const keyset = createKeyset(SORT, officialImportRuns.id, SORT_COLUMNS, cursor, cursorIdSchema);
  const rows = await db
    .select({ run: officialImportRuns, sourceKey: officialSources.key, key: keyset.key })
    .from(officialImportRuns)
    .innerJoin(officialSources, eq(officialSources.id, officialImportRuns.sourceId))
    .where(
      and(
        sourceKeys ? inArray(officialSources.key, sourceKeys) : undefined,
        kinds ? inArray(officialImportRuns.kind, kinds) : undefined,
        statuses ? inArray(officialImportRuns.state, statuses) : undefined,
        isDryRun === undefined ? undefined : eq(officialImportRuns.isDryRun, isDryRun),
        keyset.after,
      ),
    )
    .orderBy(...keyset.orderBy)
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  if (!last) return { data: [], nextCursor: null };

  const parts = await loadRunParts(page.map((row) => row.run));

  return {
    data: page.map((row) => toImportRun(row, parts)),
    nextCursor: rows.length > limit ? keyset.cursorAfter({ id: last.run.id, key: last.key }) : null,
  };
}

export async function fetchImportRun(id: string): Promise<ImportRun | null> {
  const [stored] = await storedRuns().where(eq(officialImportRuns.id, id)).limit(1);
  return stored ? toImportRun(stored, await loadRunParts([stored.run])) : null;
}

function plannedStepsOf(sourceKey: string, isDryRun: boolean): ImportRunDetail["plannedSteps"] {
  if (isDryRun) return [];

  const source = officialSourceByKey(sourceKey);
  if (source === null) return [];
  return plannedAfterSteps(afterSteps, source, false).map((step) => RUN_STEPS[step.name]);
}

export async function fetchImportRunDetail(id: string): Promise<ImportRunDetail | null> {
  const [stored] = await storedRuns().where(eq(officialImportRuns.id, id)).limit(1);
  if (!stored) return null;

  const [parts, slices, skips, steps, approvals, report] = await Promise.all([
    loadRunParts([stored.run]),
    db
      .select({
        datasetId: officialImportRunSlices.datasetId,
        datasetKey: officialDatasets.key,
        sliceKey: officialImportRunSlices.slice,
        outcome: officialImportRunSlices.outcome,
        releaseSha256: officialSnapshots.sha256,
        releaseRecordCount: officialImportRunSlices.stagedCount,
        storedRecordCount: officialImportRunSlices.liveCount,
      })
      .from(officialImportRunSlices)
      .innerJoin(officialDatasets, eq(officialDatasets.id, officialImportRunSlices.datasetId))
      .innerJoin(officialSnapshots, eq(officialSnapshots.id, officialImportRunSlices.snapshotId))
      .where(eq(officialImportRunSlices.runId, id))
      .orderBy(asc(officialImportRunSlices.datasetId), asc(officialImportRunSlices.slice)),
    db.select().from(officialImportRunSkips).where(eq(officialImportRunSkips.runId, id)).orderBy(asc(officialImportRunSkips.reason)),
    db.select().from(officialImportRunSteps).where(eq(officialImportRunSteps.runId, id)).orderBy(asc(officialImportRunSteps.step)),
    db
      .select({
        datasetId: officialImportRunApprovals.datasetId,
        sliceKey: officialImportRunApprovals.slice,
        releaseSha256: officialSnapshots.sha256,
      })
      .from(officialImportRunApprovals)
      .innerJoin(officialSnapshots, eq(officialSnapshots.id, officialImportRunApprovals.snapshotId))
      .where(eq(officialImportRunApprovals.runId, id))
      .orderBy(asc(officialImportRunApprovals.datasetId), asc(officialImportRunApprovals.slice)),
    stored.run.isDryRun ? loadDryRunReport(id) : null,
  ]);

  return {
    ...toImportRun(stored, parts),
    slices: slices.map((slice) => {
      const isOfSlice = (row: SliceRef) => row.datasetId === slice.datasetId && row.slice === slice.sliceKey;

      return {
        ...slice,
        changes: toChangeCounts(tallyChanges(parts.changes.filter(isOfSlice))),
        skips: skips.filter(isOfSlice).map(({ reason, recordCount }) => ({ reason: toSkipReason(reason), count: recordCount })),
      };
    }),
    steps: steps.map(({ step, startedAt, finishedAt, error }) => ({
      step: RUN_STEPS[step],
      startedAt: startedAt?.toISOString() ?? null,
      finishedAt: finishedAt?.toISOString() ?? null,
      error,
    })),
    plannedSteps: plannedStepsOf(stored.sourceKey, stored.run.isDryRun),
    approvals,
    dryRunReport: report ? toDryRunReport(report) : null,
  };
}

async function datasetsToRead(tx: DbTx, sourceId: number, datasetIds: readonly number[] | undefined): Promise<number[]> {
  const datasets = await tx
    .select({ id: officialDatasets.id, isEnabled: officialDatasets.isEnabled })
    .from(officialDatasets)
    .where(eq(officialDatasets.sourceId, sourceId));
  if (datasetIds !== undefined) {
    if (datasetIds.some((id) => !datasets.some((dataset) => dataset.id === id))) {
      throw new ErrorResponse("BAD_REQUEST", { message: "A dataset does not belong to this source" });
    }
    return [...datasetIds];
  }

  const enabled = datasets.filter((dataset) => dataset.isEnabled).map((dataset) => dataset.id);
  if (enabled.length === 0) throw new ErrorResponse("BAD_REQUEST", { message: "This source has no enabled dataset, so name the datasets to read" });
  return enabled;
}

async function approvedReleases(
  tx: DbTx,
  datasetIds: readonly number[],
  approvals: NonNullable<ImportRunCreate["approvals"]>,
): Promise<EnqueueRunInput["approvals"]> {
  if (approvals.length === 0) return [];
  if (approvals.some((approval) => !datasetIds.includes(approval.datasetId))) {
    throw new ErrorResponse("BAD_REQUEST", { message: "An approval names a dataset the run does not read" });
  }

  const coveredSlices = await tx
    .select({
      snapshotId: officialSnapshotSlices.snapshotId,
      sha256: officialSnapshots.sha256,
      datasetId: officialSnapshotSlices.datasetId,
      slice: officialSnapshotSlices.slice,
    })
    .from(officialSnapshotSlices)
    .innerJoin(officialSnapshots, eq(officialSnapshots.id, officialSnapshotSlices.snapshotId))
    .where(
      and(
        inArray(officialSnapshots.sha256, unique(approvals.map((approval) => approval.releaseSha256))),
        inArray(officialSnapshotSlices.datasetId, unique(approvals.map((approval) => approval.datasetId))),
      ),
    );

  return approvals.map(({ datasetId, sliceKey, releaseSha256 }) => {
    const release = coveredSlices.find((row) => row.sha256 === releaseSha256 && row.datasetId === datasetId && row.slice === sliceKey);
    if (!release) throw new ErrorResponse("BAD_REQUEST", { message: "An approval names a release that does not cover its slice" });
    return { datasetId, slice: sliceKey, snapshotId: release.snapshotId };
  });
}

export async function queueRequestedRun(tx: DbTx, request: ImportRunCreate, requestedById: string | null): Promise<string> {
  const [source] = await tx
    .select({ id: officialSources.id })
    .from(officialSources)
    .where(eq(officialSources.key, request.sourceKey))
    .for("no key update")
    .limit(1);
  if (!source) throw new ErrorResponse("BAD_REQUEST", { message: "Source not found" });

  const kind = request.kind ?? "import";
  const [liveRun] = await tx
    .select({ id: officialImportRuns.id })
    .from(officialImportRuns)
    .where(and(eq(officialImportRuns.sourceId, source.id), eq(officialImportRuns.kind, kind), inArray(officialImportRuns.state, LIVE_RUN_STATES)))
    .limit(1);
  if (liveRun) throw new ErrorResponse("CONFLICT", { message: `This source already has a queued or running ${kind} run` });

  const datasetIds = kind === "relink" ? [] : await datasetsToRead(tx, source.id, request.datasetIds);

  return enqueueRun(tx, {
    sourceId: source.id,
    kind,
    trigger: "manual",
    isDryRun: request.isDryRun ?? false,
    datasetIds,
    requestedById,
    approvals: await approvedReleases(tx, datasetIds, request.approvals ?? []),
  });
}

export function recordRunRequest(req: FastifyRequest, runId: string, requested: AuditMetadata): Promise<number> {
  return recordAuditOperation(standaloneAuditContext(req, "import"), {
    kind: "official.import",
    metadata: { config: requested, status: "queued", run_id: runId },
  });
}
