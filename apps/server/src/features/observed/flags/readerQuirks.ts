import {
  deviceModels,
  devices,
  readerVersions,
  readers,
  readingBlocks,
  socs,
  uploadFolds,
  uploadValueChecks,
  uploadValuePatterns,
  uploads,
} from "@openbts/drizzle";
import type { MeasurementModemFamily } from "@openbts/shared/contract";
import { and, countDistinct, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import db from "../../../database/psql.js";
import { unique } from "../../../lib/collections.js";
import { MATCHED_FIELDS, type MatchedField, isMatchedField } from "../cells/identity.js";
import { DAY_MS } from "./dates.js";
import type { FlagFindings, RaisedFlag } from "./kinds.js";
import { type QuirkGroup, readerQuirkSubject } from "./subjects.js";
import { type FlagSyncCounts, flagsIn, syncFlags } from "./sync.js";

const SEEN_WITHIN_DAYS = 90;
const MIN_VALUES = 20;
const MIN_UPLOADS = 3;
const MIN_DIFFERING_SHARE = 0.1;

type QuirkFlag = RaisedFlag<"readerQuirk">;
type QuirkPhones = { readerVersionId: number } | { deviceModelId: number };

export type PatternTotal = {
  groupId: number;
  field: MatchedField;
  pattern: QuirkFlag["evidence"]["pattern"];
  parameter: number;
  values: number;
  cells: number;
  uploads: number;
  people: number;
};
export type CheckTotal = { groupId: number; field: MatchedField; agreed: number; differed: number };
export type QuirkTotals = { patterns: readonly PatternTotal[]; checks: readonly CheckTotal[] };
export type ReaderVersion = NonNullable<QuirkFlag["evidence"]["readerVersion"]>;
export type DeviceModelName = { id: number; manufacturer: string; model: string; socId: number | null; modemFamily: MeasurementModemFamily | null };
export type ActiveBlock = {
  readerVersionId: number | null;
  deviceModelId: number | null;
  socId: number | null;
  modemFamily: MeasurementModemFamily | null;
  fields: readonly string[] | null;
};
export type ReaderQuirkInput = {
  byReaderVersion: QuirkTotals;
  byDeviceModel: QuirkTotals;
  readerVersions: ReadonlyMap<number, ReaderVersion>;
  models: ReadonlyMap<number, DeviceModelName>;
  blocks: readonly ActiveBlock[];
};

function findQuirks({ patterns, checks }: QuirkTotals): PatternTotal[] {
  const checksByKey = new Map(checks.map((check) => [`${check.groupId}:${check.field}`, check]));
  return patterns.filter((found) => {
    const check = checksByKey.get(`${found.groupId}:${found.field}`);
    if (check === undefined || found.values < MIN_VALUES || found.uploads < MIN_UPLOADS) return false;
    const holdsHalf = 2 * found.values >= check.differed;
    return holdsHalf && check.differed >= MIN_DIFFERING_SHARE * (check.agreed + check.differed);
  });
}

function blocksField(block: ActiveBlock, field: MatchedField): boolean {
  return block.fields === null || block.fields.includes(field);
}

function coversModel(block: ActiveBlock, model: DeviceModelName): boolean {
  if (block.deviceModelId === model.id) return true;
  return (model.socId !== null && block.socId === model.socId) || (model.modemFamily !== null && block.modemFamily === model.modemFamily);
}

function groupOf(phones: QuirkPhones): QuirkGroup {
  return "readerVersionId" in phones ? "readerVersion" : "deviceModel";
}

function subjectOf({ groupId, field, pattern, parameter }: PatternTotal, group: QuirkGroup): string {
  return readerQuirkSubject(group, groupId, field, pattern, parameter);
}

function quirkFlag(quirk: PatternTotal, phones: QuirkPhones, about: Pick<QuirkFlag["evidence"], "readerVersion" | "deviceModel">): QuirkFlag {
  const { field, pattern, parameter, values, cells, uploads, people } = quirk;
  return {
    kind: "readerQuirk",
    subjectKey: subjectOf(quirk, groupOf(phones)),
    refs: phones,
    evidence: {
      field,
      pattern,
      parameter: pattern === "bytesSwapped" ? null : parameter,
      ...about,
      valueCount: values,
      cellCount: cells,
      uploadCount: uploads,
    },
    suggestion: { readingBlock: { phones, fields: [field], mode: "drop" } },
    measure: { people },
  };
}

export function raiseReaderQuirkFlags({
  byReaderVersion,
  byDeviceModel,
  readerVersions,
  models,
  blocks,
}: ReaderQuirkInput): FlagFindings<"readerQuirk"> {
  const findings: FlagFindings<"readerQuirk"> = { raised: [], fixed: [] };
  for (const quirk of findQuirks(byReaderVersion)) {
    const readerVersion = readerVersions.get(quirk.groupId);
    if (readerVersion === undefined) continue;
    const isBlocked = blocks.some((block) => block.readerVersionId === quirk.groupId && blocksField(block, quirk.field));
    if (isBlocked) findings.fixed.push({ kind: "readerQuirk", subjectKey: subjectOf(quirk, "readerVersion") });
    else findings.raised.push(quirkFlag(quirk, { readerVersionId: quirk.groupId }, { readerVersion, deviceModel: null }));
  }
  for (const quirk of findQuirks(byDeviceModel)) {
    const found = models.get(quirk.groupId);
    if (found === undefined) continue;
    const deviceModel = { id: found.id, manufacturer: found.manufacturer, model: found.model };
    const isBlocked = blocks.some((block) => coversModel(block, found) && blocksField(block, quirk.field));
    if (isBlocked) findings.fixed.push({ kind: "readerQuirk", subjectKey: subjectOf(quirk, "deviceModel") });
    else findings.raised.push(quirkFlag(quirk, { deviceModelId: found.id }, { readerVersion: null, deviceModel }));
  }
  return findings;
}

function isFoldedSince(since: Date) {
  return and(eq(uploads.status, "processed"), isNull(uploadFolds.unfoldedAt), gte(uploads.receivedAt, since));
}

async function loadPatternTotals(group: QuirkGroup, since: Date): Promise<PatternTotal[]> {
  const groupId = group === "readerVersion" ? uploadValuePatterns.readerVersionId : devices.modelId;
  const values = sql<number>`sum(${uploadValuePatterns.valueCount})`.mapWith(Number);
  const uploadCount = countDistinct(uploadValuePatterns.uploadId);
  const rows = await db
    .select({
      groupId,
      field: uploadValuePatterns.field,
      pattern: uploadValuePatterns.pattern,
      parameter: uploadValuePatterns.parameter,
      values,
      cells: sql<number>`sum(${uploadValuePatterns.cellCount})`.mapWith(Number),
      uploads: uploadCount,
      people: countDistinct(devices.userId),
    })
    .from(uploadValuePatterns)
    .innerJoin(uploadFolds, eq(uploadFolds.uploadId, uploadValuePatterns.uploadId))
    .innerJoin(uploads, eq(uploads.id, uploadValuePatterns.uploadId))
    .innerJoin(devices, eq(devices.id, uploads.deviceId))
    .where(and(isFoldedSince(since), inArray(uploadValuePatterns.field, [...MATCHED_FIELDS])))
    .groupBy(groupId, uploadValuePatterns.field, uploadValuePatterns.pattern, uploadValuePatterns.parameter)
    .having(and(gte(values, MIN_VALUES), gte(uploadCount, MIN_UPLOADS)));
  return rows.flatMap(({ field, ...row }) => (isMatchedField(field) ? [{ ...row, field }] : []));
}

async function loadCheckTotals(group: QuirkGroup, since: Date): Promise<CheckTotal[]> {
  const groupId = group === "readerVersion" ? uploadValueChecks.readerVersionId : devices.modelId;
  const rows = await db
    .select({
      groupId,
      field: uploadValueChecks.field,
      agreed: sql<number>`sum(${uploadValueChecks.agreed})`.mapWith(Number),
      differed: sql<number>`sum(${uploadValueChecks.differed})`.mapWith(Number),
    })
    .from(uploadValueChecks)
    .innerJoin(uploadFolds, eq(uploadFolds.uploadId, uploadValueChecks.uploadId))
    .innerJoin(uploads, eq(uploads.id, uploadValueChecks.uploadId))
    .innerJoin(devices, eq(devices.id, uploads.deviceId))
    .where(and(isFoldedSince(since), inArray(uploadValueChecks.field, [...MATCHED_FIELDS])))
    .groupBy(groupId, uploadValueChecks.field);
  return rows.flatMap(({ field, ...row }) => (isMatchedField(field) ? [{ ...row, field }] : []));
}

async function loadTotals(group: QuirkGroup, since: Date): Promise<QuirkTotals> {
  const [patterns, checks] = await Promise.all([loadPatternTotals(group, since), loadCheckTotals(group, since)]);
  return { patterns, checks };
}

async function loadReaderVersions(versionIds: readonly number[]): Promise<Map<number, ReaderVersion>> {
  if (versionIds.length === 0) return new Map();

  const rows = await db
    .select({ id: readerVersions.id, reader: readerVersions.readerName, source: readers.source, version: readerVersions.version })
    .from(readerVersions)
    .innerJoin(readers, eq(readers.name, readerVersions.readerName))
    .where(inArray(readerVersions.id, [...versionIds]));
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadModels(modelIds: readonly number[]): Promise<Map<number, DeviceModelName>> {
  if (modelIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: deviceModels.id,
      manufacturer: deviceModels.manufacturer,
      model: deviceModels.model,
      socId: deviceModels.socId,
      modemFamily: socs.modemFamily,
    })
    .from(deviceModels)
    .leftJoin(socs, eq(socs.id, deviceModels.socId))
    .where(inArray(deviceModels.id, [...modelIds]));
  return new Map(rows.map((row) => [row.id, row]));
}

async function loadActiveBlocks(): Promise<ActiveBlock[]> {
  return db
    .select({
      readerVersionId: readingBlocks.readerVersionId,
      deviceModelId: readingBlocks.deviceModelId,
      socId: readingBlocks.socId,
      modemFamily: readingBlocks.modemFamily,
      fields: readingBlocks.fields,
    })
    .from(readingBlocks)
    .where(
      and(
        isNull(readingBlocks.disabledAt),
        isNull(readingBlocks.rats),
        isNull(readingBlocks.roles),
        isNull(readingBlocks.sdkIntMin),
        isNull(readingBlocks.sdkIntMax),
        isNull(readingBlocks.radioVersionPrefix),
      ),
    );
}

export async function syncReaderQuirkFlags(): Promise<FlagSyncCounts> {
  const since = new Date(Date.now() - SEEN_WITHIN_DAYS * DAY_MS);
  const [byReaderVersion, byDeviceModel, blocks] = await Promise.all([
    loadTotals("readerVersion", since),
    loadTotals("deviceModel", since),
    loadActiveBlocks(),
  ]);
  const [readerVersions, models] = await Promise.all([
    loadReaderVersions(unique(byReaderVersion.patterns.map((found) => found.groupId))),
    loadModels(unique(byDeviceModel.patterns.map((found) => found.groupId))),
  ]);
  const { raised, fixed } = raiseReaderQuirkFlags({ byReaderVersion, byDeviceModel, readerVersions, models, blocks });
  return db.transaction((tx) => syncFlags(tx, { kinds: ["readerQuirk"], raised, fixed: flagsIn(fixed) }));
}
