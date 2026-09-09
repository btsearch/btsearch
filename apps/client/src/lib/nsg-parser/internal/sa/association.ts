import type { NsgCell, NsgEvent, NsgJsonObject } from "../../model";
import { resolveNrIdentity } from "../nrIdentity";
import type { DefaultDataSubscriptionChange, LteAnchor, TimedLteServingCellInfo } from "../nsa/model";
import type { TimedNrMeasurement } from "../nsa/model";
import { createNsaAnchorResolver } from "../nsa/streamMapping";
import { QUALCOMM_NR_CONFIGURATION_INFO_LOG_CODE, isConnectedQualcommNrSa } from "../qualcomm/nrConfiguration";
import type { QualcommNrActiveCarrier } from "../qualcomm/nrConfiguration";
import { QUALCOMM_NR_MEASUREMENT_LOG_CODE } from "../qualcomm/nrMeasurement";
import type { QualcommNrMeasurementCell } from "../qualcomm/nrMeasurement";
import { QUALCOMM_NR_SERVING_CELL_INFO_LOG_CODE } from "../qualcomm/nrServingCell";
import type { TimedNrConfigurationInfo, TimedNrServingCellInfo } from "./model";

const ASSOCIATION_MAX_AGE_US = 1_000_000;
const STREAM_VOTE_WINDOW_US = 15_000_000;
const MAX_NR_ARFCN = 3_279_165;
const MAX_NR_NCI = 0x0fffffffffn;
const MAX_NR_PCI = 1_007;
const MAX_NR_TAC = 0xffffff;

type TimelinePoint = Readonly<{
  elapsedUs: number;
  recordOffset: number;
}>;

type SaState = Readonly<{
  configuration: TimedNrConfigurationInfo;
  epoch: number;
}>;

type IndexedSaState = Readonly<{
  configuration: TimedNrConfigurationInfo;
  epoch: number | null;
}>;

type AndroidNrContext = TimelinePoint &
  Readonly<{
    event: NsgEvent;
    cellPositions: readonly number[];
  }>;

type SaEventContext = AndroidNrContext &
  Readonly<{
    state: SaState;
  }>;

type SubscriptionGroup = Readonly<{
  key: string;
  contexts: readonly AndroidNrContext[];
}>;

type StreamVote = TimelinePoint &
  Readonly<{
    group: SubscriptionGroup;
  }>;

type NrPair = Readonly<{
  arfcn: number;
  pci: number;
}>;

type MeasurementContribution = Readonly<{
  observation: TimedNrMeasurement;
  cell: QualcommNrMeasurementCell;
}>;

type CellContributions = {
  carrier?: QualcommNrActiveCarrier;
  measurement?: MeasurementContribution;
  servingCell?: TimedNrServingCellInfo;
};

type StandaloneCellDefinition = Readonly<{
  servingCell: TimedNrServingCellInfo | null;
  measurement: MeasurementContribution | null;
}>;

type StandaloneGroup = Readonly<{
  envelope: NsgCell | null;
  point: TimedNrServingCellInfo | TimedNrMeasurement;
  state: SaState;
  streamIndex: number;
  cells: readonly StandaloneCellDefinition[];
}>;

export type QualcommSaFusionResult = Readonly<{
  cells: NsgCell[];
  syntheticEvents: NsgEvent[];
  remainingMeasurements: TimedNrMeasurement[];
}>;

function compareTimeline(left: TimelinePoint, right: TimelinePoint): number {
  return left.elapsedUs - right.elapsedUs || left.recordOffset - right.recordOffset;
}

function isPositiveSa(configuration: TimedNrConfigurationInfo): boolean {
  return configuration.configuration.version === 8 && isConnectedQualcommNrSa(configuration.configuration);
}

function buildConfigurationTimeline(configurations: readonly TimedNrConfigurationInfo[]): Map<number, IndexedSaState[]> {
  const byStream = new Map<number, TimedNrConfigurationInfo[]>();
  for (const configuration of configurations) {
    const stream = byStream.get(configuration.streamIndex);
    if (stream) stream.push(configuration);
    else byStream.set(configuration.streamIndex, [configuration]);
  }

  const timelines = new Map<number, IndexedSaState[]>();
  for (const [streamIndex, records] of byStream) {
    records.sort(compareTimeline);
    const states: IndexedSaState[] = [];
    let epoch = 0;
    let wasSa = false;
    for (const configuration of records) {
      const sa = isPositiveSa(configuration);
      if (sa && !wasSa) epoch++;
      states.push({ configuration, epoch: sa ? epoch : null });
      wasSa = sa;
    }
    timelines.set(streamIndex, states);
  }
  return timelines;
}

function indexedStateAt(timelines: ReadonlyMap<number, readonly IndexedSaState[]>, streamIndex: number, point: TimelinePoint): IndexedSaState | null {
  const timeline = timelines.get(streamIndex);
  if (!timeline) return null;
  let low = 0;
  let high = timeline.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (compareTimeline(timeline[middle].configuration, point) <= 0) low = middle + 1;
    else high = middle;
  }
  return low === 0 ? null : timeline[low - 1];
}

function saStateAt(timelines: ReadonlyMap<number, readonly IndexedSaState[]>, streamIndex: number, point: TimelinePoint): SaState | null {
  const state = indexedStateAt(timelines, streamIndex, point);
  if (state === null) return null;
  return state.epoch === null ? null : { configuration: state.configuration, epoch: state.epoch };
}

function futureSaStateAt(timelines: ReadonlyMap<number, readonly IndexedSaState[]>, streamIndex: number, point: TimelinePoint): SaState | null {
  const timeline = timelines.get(streamIndex);
  if (!timeline || indexedStateAt(timelines, streamIndex, point) !== null) return null;
  const state = timeline[0];
  if (state === undefined || state.epoch === null) return null;
  if (state.configuration.elapsedUs - point.elapsedUs > ASSOCIATION_MAX_AGE_US) return null;
  return { configuration: state.configuration, epoch: state.epoch };
}

function stateKey(streamIndex: number, epoch: number): string {
  return `${streamIndex}:${epoch}`;
}

function nearestRecord<T extends TimelinePoint>(records: readonly T[], point: TimelinePoint): T | null {
  if (records.length === 0) return null;
  let low = 0;
  let high = records.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (compareTimeline(records[middle], point) < 0) low = middle + 1;
    else high = middle;
  }
  const before = records[low - 1] ?? null;
  const after = records[low] ?? null;
  if (before === null) return after;
  if (after === null) return before;
  const beforeDistance = Math.abs(before.elapsedUs - point.elapsedUs);
  const afterDistance = Math.abs(after.elapsedUs - point.elapsedUs);
  if (beforeDistance !== afterDistance) return beforeDistance < afterDistance ? before : after;
  return Math.abs(before.recordOffset - point.recordOffset) <= Math.abs(after.recordOffset - point.recordOffset) ? before : after;
}

function isSameEnvelope(cell: NsgCell, event: NsgEvent): boolean {
  return (
    cell.eventIndex === event.id &&
    cell.recordOffset === event.recordOffset &&
    cell.elapsedUs === event.elapsedUs &&
    cell.timestampUs === event.timestampUs &&
    cell.timestampMs === event.timestampMs
  );
}

function createAndroidNrContexts(cells: readonly NsgCell[], events: readonly NsgEvent[]): AndroidNrContext[] {
  const eventsById = new Map(events.map((event) => [event.id, event]));
  const positionsByEvent = new Map<number, number[]>();
  for (let position = 0; position < cells.length; position++) {
    const cell = cells[position];
    if (cell.rat !== "NR") continue;
    const positions = positionsByEvent.get(cell.eventIndex);
    if (positions) positions.push(position);
    else positionsByEvent.set(cell.eventIndex, [position]);
  }

  const contexts: AndroidNrContext[] = [];
  for (const [eventIndex, cellPositions] of positionsByEvent) {
    const event = eventsById.get(eventIndex);
    if (!event || event.name !== "ScheduleCellInfo") continue;
    if (!cellPositions.every((position) => isSameEnvelope(cells[position], event))) continue;
    const first = cells[cellPositions[0]];
    if (
      !cellPositions.every(
        (position) =>
          cells[position].subId === first.subId &&
          cells[position].slotId === first.slotId &&
          cells[position].isDefaultSubscription === first.isDefaultSubscription,
      )
    )
      continue;
    contexts.push({ event, cellPositions, elapsedUs: event.elapsedUs, recordOffset: event.recordOffset });
  }
  return contexts;
}

function subscriptionKey(cell: NsgCell): string | null {
  if (cell.slotId === null && cell.subId === null) return null;
  return `${cell.slotId ?? "?"}:${cell.subId ?? "?"}`;
}

function createSubscriptionGroups(contexts: readonly AndroidNrContext[], cells: readonly NsgCell[]): SubscriptionGroup[] {
  const grouped = new Map<string, AndroidNrContext[]>();
  for (const context of contexts) {
    const key = subscriptionKey(cells[context.cellPositions[0]]);
    if (key === null) continue;
    const group = grouped.get(key);
    if (group) group.push(context);
    else grouped.set(key, [context]);
  }
  return [...grouped].map(([key, groupContexts]) => ({
    key,
    contexts: groupContexts.sort(compareTimeline),
  }));
}

function collectStreamVotes(
  groups: readonly SubscriptionGroup[],
  cells: readonly NsgCell[],
  timelines: ReadonlyMap<number, readonly IndexedSaState[]>,
  servingCellInfos: readonly TimedNrServingCellInfo[],
): Map<number, StreamVote[]> {
  const votesByStream = new Map<number, StreamVote[]>();
  for (const servingCell of servingCellInfos) {
    if (servingCell.info.version !== 4) continue;
    const existingState = saStateAt(timelines, servingCell.streamIndex, servingCell);
    const state = existingState ?? futureSaStateAt(timelines, servingCell.streamIndex, servingCell);
    if (state === null) continue;
    const nci = matchableNci(servingCell.info.cellIdentity);
    if (nci === null) continue;
    const associationWindowUs = existingState === null ? ASSOCIATION_MAX_AGE_US : STREAM_VOTE_WINDOW_US;
    let matchedGroup: SubscriptionGroup | null = null;
    let ambiguous = false;
    for (const group of groups) {
      const matches = group.contexts.some(
        (context) =>
          Math.abs(context.elapsedUs - servingCell.elapsedUs) <= associationWindowUs &&
          (existingState !== null || context.cellPositions.some((position) => cells[position].nrMode === "SA")) &&
          context.cellPositions.some((position) => validCellNci(cells[position].nci) === nci),
      );
      if (!matches) continue;
      if (matchedGroup !== null) {
        ambiguous = true;
        break;
      }
      matchedGroup = group;
    }
    if (matchedGroup === null || ambiguous) continue;
    const vote: StreamVote = {
      elapsedUs: servingCell.elapsedUs,
      recordOffset: servingCell.recordOffset,
      group: matchedGroup,
    };
    const votes = votesByStream.get(servingCell.streamIndex);
    if (votes) votes.push(vote);
    else votesByStream.set(servingCell.streamIndex, [vote]);
  }
  for (const votes of votesByStream.values()) votes.sort(compareTimeline);
  return votesByStream;
}

function createContextResolvers(
  groups: readonly SubscriptionGroup[],
  cells: readonly NsgCell[],
  timelines: ReadonlyMap<number, readonly IndexedSaState[]>,
  servingCellInfos: readonly TimedNrServingCellInfo[],
  lteAnchors: readonly LteAnchor[],
  lteServingCellInfos: readonly TimedLteServingCellInfo[],
  defaultDataSubscriptions: readonly DefaultDataSubscriptionChange[],
): Readonly<{
  resolveContexts: (streamIndex: number, point: TimelinePoint) => readonly AndroidNrContext[] | null;
  resolveEvidenceContexts: (streamIndex: number, point: TimelinePoint) => readonly AndroidNrContext[] | null;
}> {
  const groupsByKey = new Map(groups.map((group) => [group.key, group]));
  const votesByStream = collectStreamVotes(groups, cells, timelines, servingCellInfos);
  const resolveLteAnchors = createNsaAnchorResolver(lteAnchors, lteServingCellInfos, defaultDataSubscriptions);
  const resolveEvidenceLteAnchors = createNsaAnchorResolver(lteAnchors, lteServingCellInfos, defaultDataSubscriptions, {
    allowFallbacks: false,
  });

  const groupForAnchors = (anchors: readonly LteAnchor[] | null): readonly AndroidNrContext[] | null => {
    if (anchors === null || anchors.length === 0) return null;
    const keys = new Set(anchors.map((anchor) => subscriptionKey(anchor.cell)).filter((key): key is string => key !== null));
    if (keys.size !== 1) return null;
    return groupsByKey.get([...keys][0])?.contexts ?? null;
  };

  const resolveEvidenceContexts = (streamIndex: number, point: TimelinePoint): readonly AndroidNrContext[] | null => {
    const votes = votesByStream.get(streamIndex);
    if (votes && votes.length > 0) return nearestRecord(votes, point)?.group.contexts ?? null;
    return groupForAnchors(resolveEvidenceLteAnchors(streamIndex, point.elapsedUs));
  };

  const resolveContexts = (streamIndex: number, point: TimelinePoint): readonly AndroidNrContext[] | null => {
    const evidenceContexts = resolveEvidenceContexts(streamIndex, point);
    if (evidenceContexts !== null) return evidenceContexts;

    const lteContexts = groupForAnchors(resolveLteAnchors(streamIndex, point.elapsedUs));
    if (lteContexts !== null) return lteContexts;

    return groups.length === 1 ? groups[0].contexts : null;
  };
  return { resolveContexts, resolveEvidenceContexts };
}

function createSaEventContexts(
  contexts: readonly AndroidNrContext[],
  timelines: ReadonlyMap<number, readonly IndexedSaState[]>,
  resolveContexts: (streamIndex: number, point: TimelinePoint) => readonly AndroidNrContext[] | null,
): SaEventContext[] {
  const resolved: SaEventContext[] = [];
  for (const context of contexts) {
    let matchedState: SaState | null = null;
    let ambiguous = false;
    for (const streamIndex of timelines.keys()) {
      const state = saStateAt(timelines, streamIndex, context);
      if (state === null || !resolveContexts(streamIndex, context)?.includes(context)) continue;
      if (matchedState !== null) {
        ambiguous = true;
        break;
      }
      matchedState = state;
    }
    if (matchedState !== null && !ambiguous) resolved.push({ ...context, state: matchedState });
  }
  return resolved;
}

function createFutureSaEventContexts(
  contexts: readonly AndroidNrContext[],
  cells: readonly NsgCell[],
  timelines: ReadonlyMap<number, readonly IndexedSaState[]>,
  servingCellInfos: readonly TimedNrServingCellInfo[],
): SaEventContext[] {
  const resolvedByEvent = new Map<number, SaEventContext>();
  const ambiguousEvents = new Set<number>();

  for (const servingCell of servingCellInfos) {
    if (servingCell.info.version !== 4) continue;
    const state = futureSaStateAt(timelines, servingCell.streamIndex, servingCell);
    if (state === null) continue;
    const context = scheduleSaContextForServingCell(contexts, cells, servingCell, state.configuration);
    if (context === null) continue;
    if (state.configuration.elapsedUs - context.elapsedUs > ASSOCIATION_MAX_AGE_US) continue;
    if (ambiguousEvents.has(context.event.id)) continue;

    const candidate = { ...context, state };
    const existing = resolvedByEvent.get(context.event.id);
    if (existing === undefined) {
      resolvedByEvent.set(context.event.id, candidate);
      continue;
    }
    if (stateKey(existing.state.configuration.streamIndex, existing.state.epoch) === stateKey(servingCell.streamIndex, state.epoch)) continue;
    resolvedByEvent.delete(context.event.id);
    ambiguousEvents.add(context.event.id);
  }

  return [...resolvedByEvent.values()];
}

function groupContexts(contexts: readonly SaEventContext[]): Map<string, SaEventContext[]> {
  const grouped = new Map<string, SaEventContext[]>();
  for (const context of contexts) {
    const key = stateKey(context.state.configuration.streamIndex, context.state.epoch);
    const records = grouped.get(key);
    if (records) records.push(context);
    else grouped.set(key, [context]);
  }
  for (const records of grouped.values()) records.sort((left, right) => compareTimeline(left.event, right.event));
  return grouped;
}

function matchableNci(value: bigint): number | null {
  return value > 0n && value <= MAX_NR_NCI ? Number(value) : null;
}

function canonicalNci(value: bigint): number | null {
  return value >= 0n && value <= MAX_NR_NCI ? Number(value) : null;
}

function validCellNci(value: number | null): number | null {
  return value !== null && Number.isSafeInteger(value) && value > 0 && BigInt(value) <= MAX_NR_NCI ? value : null;
}

function validPci(value: number): number | null {
  return Number.isInteger(value) && value >= 0 && value <= MAX_NR_PCI ? value : null;
}

function validArfcn(value: number): number | null {
  return Number.isInteger(value) && value > 0 && value <= MAX_NR_ARFCN ? value : null;
}

function validTac(value: number): number | null {
  return Number.isInteger(value) && value >= 0 && value <= MAX_NR_TAC ? value : null;
}

function validBand(value: number): number | null {
  return Number.isInteger(value) && value > 0 && value <= 0xffff ? value : null;
}

function pair(arfcn: number | null, pci: number | null): NrPair | null {
  const validFrequency = arfcn === null ? null : validArfcn(arfcn);
  const validPhysicalCell = pci === null ? null : validPci(pci);
  return validFrequency === null || validPhysicalCell === null ? null : { arfcn: validFrequency, pci: validPhysicalCell };
}

function cellPair(cell: NsgCell): NrPair | null {
  return pair(cell.arfcn, cell.pci);
}

function measurementPair(cell: QualcommNrMeasurementCell): NrPair | null {
  return pair(cell.arfcn, cell.pci);
}

function servingMeasurementCandidate(cells: readonly QualcommNrMeasurementCell[], physicalCellId: number): QualcommNrMeasurementCell | null {
  const candidates = cells.filter((cell) => validPci(cell.pci) === physicalCellId);
  const explicitServing = cells.some((cell) => cell.serving);
  const eligible = explicitServing ? candidates.filter((cell) => cell.serving) : candidates;
  return eligible.length === 1 ? eligible[0] : null;
}

function carrierArfcn(carrier: QualcommNrActiveCarrier): number | null {
  return validArfcn(carrier.downlinkArfcn);
}

function samePair(left: NrPair | null, right: NrPair | null): boolean {
  return left !== null && right !== null && left.arfcn === right.arfcn && left.pci === right.pci;
}

function uniquePosition(cellPositions: readonly number[], cells: readonly NsgCell[], matches: (cell: NsgCell) => boolean): number | null {
  let matched: number | null = null;
  for (const position of cellPositions) {
    if (!matches(cells[position])) continue;
    if (matched !== null) return null;
    matched = position;
  }
  return matched;
}

function uniqueAvailablePairPosition(
  cellPositions: readonly number[],
  cells: readonly NsgCell[],
  targetPair: NrPair,
  occupiedPositions: ReadonlySet<number>,
): number | null {
  let matched: number | null = null;
  for (const position of cellPositions) {
    if (occupiedPositions.has(position) || !samePair(cellPair(cells[position]), targetPair)) continue;
    if (matched !== null) return null;
    matched = position;
  }
  return matched;
}

function hasExactSchedulePair(context: AndroidNrContext, cells: readonly NsgCell[], observation: TimedNrMeasurement): boolean {
  for (const decoded of observation.measurement.cells) {
    const targetPair = measurementPair(decoded);
    if (targetPair === null) continue;
    if (uniquePosition(context.cellPositions, cells, (cell) => samePair(cellPair(cell), targetPair)) !== null) return true;
  }
  return false;
}

function uniqueScheduleContext(candidates: readonly AndroidNrContext[], cells: readonly NsgCell[], point: TimelinePoint): AndroidNrContext | null {
  if (candidates.length === 0) return null;
  const keys = candidates.map((context) => subscriptionKey(cells[context.cellPositions[0]]));
  const attributedKeys = new Set(keys.filter((key): key is string => key !== null));
  if (keys.some((key) => key === null)) return candidates.length === 1 ? candidates[0] : null;
  if (attributedKeys.size !== 1) return null;
  return nearestRecord(candidates, point);
}

function scheduleSaContextForMeasurement(
  contexts: readonly AndroidNrContext[],
  cells: readonly NsgCell[],
  observation: TimedNrMeasurement,
): AndroidNrContext | null {
  const candidates = contexts.filter(
    (context) =>
      Math.abs(context.elapsedUs - observation.elapsedUs) <= ASSOCIATION_MAX_AGE_US &&
      context.cellPositions.some((position) => cells[position].nrMode === "SA") &&
      hasExactSchedulePair(context, cells, observation),
  );
  return uniqueScheduleContext(candidates, cells, observation);
}

function scheduleSaContextForServingCell(
  contexts: readonly AndroidNrContext[],
  cells: readonly NsgCell[],
  servingCell: TimedNrServingCellInfo,
  before: TimelinePoint | null = null,
): AndroidNrContext | null {
  const nci = matchableNci(servingCell.info.cellIdentity);
  if (nci === null) return null;
  const candidates = contexts.filter(
    (context) =>
      Math.abs(context.elapsedUs - servingCell.elapsedUs) <= ASSOCIATION_MAX_AGE_US &&
      (before === null || compareTimeline(context, before) < 0) &&
      context.cellPositions.some((position) => cells[position].nrMode === "SA") &&
      uniquePosition(context.cellPositions, cells, (cell) => validCellNci(cell.nci) === nci) !== null,
  );
  return uniqueScheduleContext(candidates, cells, servingCell);
}

function servingPosition(
  context: SaEventContext,
  cells: readonly NsgCell[],
  servingCell: TimedNrServingCellInfo | null,
  measurement: TimedNrMeasurement | null,
): number | null {
  if (servingCell === null) return null;
  const nci = matchableNci(servingCell.info.cellIdentity);
  if (nci !== null) {
    const matched = uniquePosition(context.cellPositions, cells, (cell) => validCellNci(cell.nci) === nci);
    if (matched !== null) return matched;
  }
  const pci = validPci(servingCell.info.physicalCellId);
  if (pci === null || measurement === null) return null;
  const candidate = servingMeasurementCandidate(measurement.measurement.cells, pci);
  const servingPair = candidate === null ? null : measurementPair(candidate);
  return servingPair === null ? null : uniquePosition(context.cellPositions, cells, (cell) => samePair(cellPair(cell), servingPair));
}

function configurationProvenance(record: TimedNrConfigurationInfo): NsgJsonObject {
  return {
    diagConfigurationLogCode: `0x${QUALCOMM_NR_CONFIGURATION_INFO_LOG_CODE.toString(16).toUpperCase()}`,
    diagConfigurationVersion: record.configuration.version,
    diagConfigurationRecordOffset: record.recordOffset,
    diagConfigurationStreamIndex: record.streamIndex,
    diagConfigurationElapsedUs: record.elapsedUs,
    diagConfigurationTimestampUs: record.timestampUs,
    diagConfigurationTimestampMs: record.timestampMs,
    diagConfigurationState: record.configuration.state,
    diagConfigurationActive: record.configuration.configurationActive,
    diagConfigurationConnectivityMode: record.configuration.connectivityMode,
  };
}

function servingProvenance(record: TimedNrServingCellInfo): NsgJsonObject {
  return {
    diagServingCellLogCode: `0x${QUALCOMM_NR_SERVING_CELL_INFO_LOG_CODE.toString(16).toUpperCase()}`,
    diagServingCellVersion: record.info.version,
    diagServingCellRecordOffset: record.recordOffset,
    diagServingCellStreamIndex: record.streamIndex,
    diagServingCellElapsedUs: record.elapsedUs,
    diagServingCellTimestampUs: record.timestampUs,
    diagServingCellTimestampMs: record.timestampMs,
    diagServingCellIdentity: record.info.cellIdentity.toString(),
    diagServingCellPci: record.info.physicalCellId,
    diagServingCellDownlinkFrequency: record.info.downlinkFrequency,
    diagServingCellUplinkFrequency: record.info.uplinkFrequency,
    diagServingCellDownlinkBandwidth: record.info.downlinkBandwidth,
    diagServingCellUplinkBandwidth: record.info.uplinkBandwidth,
    diagServingCellMcc: record.info.mcc,
    diagServingCellMncDigitCount: record.info.mncDigitCount,
    diagServingCellMnc: record.info.mnc,
    diagServingCellAllowedAccess: record.info.allowedAccess,
    diagServingCellTac: record.info.tac,
    diagServingCellBand: record.info.band,
  };
}

function measurementProvenance(contribution: MeasurementContribution): NsgJsonObject {
  const { observation, cell } = contribution;
  return {
    diagMeasurementLogCode: `0x${QUALCOMM_NR_MEASUREMENT_LOG_CODE.toString(16).toUpperCase()}`,
    diagMeasurementVersion: `${observation.measurement.versionMajor}.${observation.measurement.versionMinor}`,
    diagMeasurementRecordOffset: observation.recordOffset,
    diagMeasurementStreamIndex: observation.streamIndex,
    diagMeasurementElapsedUs: observation.elapsedUs,
    diagMeasurementTimestampUs: observation.timestampUs,
    diagMeasurementTimestampMs: observation.timestampMs,
    diagMeasurementCarrierIndex: cell.carrierIndex,
    diagMeasurementCellIndex: cell.cellIndex,
    diagMeasurementCcId: cell.ccId,
    diagMeasurementServing: cell.serving,
    diagMeasurementPci: cell.pci,
    diagMeasurementArfcn: cell.arfcn,
    diagMeasurementSfn: cell.sfn,
    diagMeasurementBeamCount: cell.beamCount,
    diagMeasurementRsrp: cell.rsrp,
    diagMeasurementRsrq: cell.rsrq,
  };
}

function fuseScheduleSaCell(cell: NsgCell, contribution: MeasurementContribution): NsgCell {
  const decoded = contribution.cell;
  const raw: NsgJsonObject = { ...cell.raw, ...measurementProvenance(contribution), nrMode: "SA" };
  delete raw.measurementRole;
  const fused: NsgCell = {
    ...cell,
    measurementRole: undefined,
    nrMode: "SA",
    sources: ["qualcomm-diag", "android-telephony"],
    pci: validPci(decoded.pci) ?? cell.pci,
    arfcn: validArfcn(decoded.arfcn) ?? cell.arfcn,
    rsrp: Number.isFinite(decoded.rsrp) ? decoded.rsrp : cell.rsrp,
    rsrq: Number.isFinite(decoded.rsrq) ? decoded.rsrq : cell.rsrq,
    raw,
  };
  return { ...fused, ...resolveNrIdentity(raw, fused.nci) };
}

function createScheduleSaNeighbor(envelope: NsgCell, event: NsgEvent, cellIndex: number, contribution: MeasurementContribution): NsgCell {
  const decoded = contribution.cell;
  const raw: NsgJsonObject = {
    type: "nr",
    registered: false,
    source: "qualcomm-diag",
    nrMode: "SA",
    ...measurementProvenance(contribution),
  };
  return {
    eventIndex: event.id,
    cellIndex,
    recordOffset: event.recordOffset,
    elapsedUs: event.elapsedUs,
    timestampUs: event.timestampUs,
    timestampMs: event.timestampMs,
    rat: "NR",
    registered: false,
    nrMode: "SA",
    sources: ["qualcomm-diag", "android-telephony"],
    subId: envelope.subId,
    slotId: envelope.slotId,
    isDefaultSubscription: envelope.isDefaultSubscription,
    mcc: envelope.mcc,
    mnc: envelope.mnc,
    operatorName: envelope.operatorName,
    lac: null,
    rnc: null,
    cid: null,
    tac: null,
    nci: null,
    ...resolveNrIdentity(raw, null),
    eci: null,
    pci: validPci(decoded.pci),
    earfcn: null,
    arfcn: validArfcn(decoded.arfcn),
    uarfcn: null,
    psc: null,
    bsic: null,
    dbm: null,
    rssi: null,
    rsrp: Number.isFinite(decoded.rsrp) ? decoded.rsrp : null,
    rsrq: Number.isFinite(decoded.rsrq) ? decoded.rsrq : null,
    sinr: null,
    ecno: null,
    ta: null,
    ber: null,
    bands: null,
    raw,
  };
}

function carrierProvenance(carrier: QualcommNrActiveCarrier): NsgJsonObject {
  return {
    diagConfigurationCarrierCcId: carrier.ccId,
    diagConfigurationCarrierCellId: carrier.cellId,
    diagConfigurationCarrierDownlinkArfcn: carrier.downlinkArfcn,
    diagConfigurationCarrierUplinkArfcn: carrier.uplinkArfcn,
    diagConfigurationCarrierBand: carrier.band,
    diagConfigurationCarrierBandType: carrier.bandType,
    diagConfigurationCarrierDownlinkBandwidth: carrier.downlinkBandwidth,
    diagConfigurationCarrierUplinkBandwidth: carrier.uplinkBandwidth,
    diagConfigurationCarrierDownlinkMaxMimo: carrier.downlinkMaxMimo,
    diagConfigurationCarrierUplinkMaxMimo: carrier.uplinkMaxMimo,
  };
}

function fuseCell(cell: NsgCell, state: SaState, contributions: CellContributions): NsgCell {
  const raw: NsgJsonObject = { ...cell.raw, ...configurationProvenance(state.configuration), nrMode: "SA" };
  delete raw.measurementRole;
  let fused: NsgCell = {
    ...cell,
    measurementRole: undefined,
    nrMode: "SA",
    sources: ["qualcomm-diag", "android-telephony"],
    raw,
  };
  if (contributions.carrier) {
    const carrier = contributions.carrier;
    fused = {
      ...fused,
      arfcn: validArfcn(carrier.downlinkArfcn) ?? fused.arfcn,
      bands: validBand(carrier.band) === null ? fused.bands : [carrier.band],
    };
    Object.assign(raw, carrierProvenance(carrier));
  }
  if (contributions.servingCell) {
    const record = contributions.servingCell;
    const info = record.info;
    const band = validBand(info.band);
    fused = {
      ...fused,
      nci: canonicalNci(info.cellIdentity) ?? fused.nci,
      tac: validTac(info.tac) ?? fused.tac,
      pci: validPci(info.physicalCellId) ?? fused.pci,
      bands: band === null ? fused.bands : [band],
    };
    Object.assign(raw, servingProvenance(record));
  }
  if (contributions.measurement) {
    const decoded = contributions.measurement.cell;
    fused = {
      ...fused,
      pci: validPci(decoded.pci) ?? fused.pci,
      arfcn: validArfcn(decoded.arfcn) ?? fused.arfcn,
      rsrp: Number.isFinite(decoded.rsrp) ? decoded.rsrp : fused.rsrp,
      rsrq: Number.isFinite(decoded.rsrq) ? decoded.rsrq : fused.rsrq,
    };
    Object.assign(raw, measurementProvenance(contributions.measurement));
  }
  return { ...fused, ...resolveNrIdentity(raw, fused.nci) };
}

function createDerivedNeighbor(
  envelope: NsgCell,
  event: NsgEvent,
  cellIndex: number,
  state: SaState,
  contribution: MeasurementContribution,
  carrier: QualcommNrActiveCarrier | undefined,
): NsgCell {
  const decoded = contribution.cell;
  const band = carrier ? validBand(carrier.band) : null;
  const raw: NsgJsonObject = {
    type: "nr",
    registered: false,
    source: "qualcomm-diag",
    nrMode: "SA",
    ...configurationProvenance(state.configuration),
    ...measurementProvenance(contribution),
  };
  if (carrier) Object.assign(raw, carrierProvenance(carrier));
  return {
    eventIndex: event.id,
    cellIndex,
    recordOffset: event.recordOffset,
    elapsedUs: event.elapsedUs,
    timestampUs: event.timestampUs,
    timestampMs: event.timestampMs,
    rat: "NR",
    registered: false,
    nrMode: "SA",
    sources: ["qualcomm-diag", "android-telephony"],
    subId: envelope.subId,
    slotId: envelope.slotId,
    isDefaultSubscription: envelope.isDefaultSubscription,
    mcc: envelope.mcc,
    mnc: envelope.mnc,
    operatorName: envelope.operatorName,
    lac: null,
    rnc: null,
    cid: null,
    tac: null,
    nci: null,
    ...resolveNrIdentity(raw, null),
    eci: null,
    pci: validPci(decoded.pci),
    earfcn: null,
    arfcn: validArfcn(decoded.arfcn),
    uarfcn: null,
    psc: null,
    bsic: null,
    dbm: null,
    rssi: null,
    rsrp: Number.isFinite(decoded.rsrp) ? decoded.rsrp : null,
    rsrq: Number.isFinite(decoded.rsrq) ? decoded.rsrq : null,
    sinr: null,
    ecno: null,
    ta: null,
    ber: null,
    bands: band === null ? null : [band],
    raw,
  };
}

function nearestAnchor(anchors: readonly LteAnchor[], elapsedUs: number): LteAnchor | null {
  if (anchors.length === 0) return null;
  let nearest = anchors[0];
  for (let index = 1; index < anchors.length; index++) {
    const candidate = anchors[index];
    if (Math.abs(candidate.cell.elapsedUs - elapsedUs) < Math.abs(nearest.cell.elapsedUs - elapsedUs)) nearest = candidate;
  }
  return nearest;
}

function standaloneEnvelope(
  streamIndex: number,
  point: TimelinePoint,
  cells: readonly NsgCell[],
  resolveContexts: (streamIndex: number, point: TimelinePoint) => readonly AndroidNrContext[] | null,
  resolveLteAnchors: (streamIndex: number, elapsedUs: number) => readonly LteAnchor[] | null,
): NsgCell | null {
  const contexts = resolveContexts(streamIndex, point);
  const context = contexts ? nearestRecord(contexts, point) : null;
  if (context !== null && Math.abs(context.elapsedUs - point.elapsedUs) <= ASSOCIATION_MAX_AGE_US) return cells[context.cellPositions[0]];

  const anchors = resolveLteAnchors(streamIndex, point.elapsedUs);
  const anchor = anchors ? nearestAnchor(anchors, point.elapsedUs) : null;
  return anchor !== null && Math.abs(anchor.cell.elapsedUs - point.elapsedUs) <= ASSOCIATION_MAX_AGE_US ? anchor.cell : null;
}

function standaloneCarrier(state: SaState, measurement: MeasurementContribution | null): QualcommNrActiveCarrier | undefined {
  const carriers = state.configuration.configuration.activeCarriers;
  if (measurement === null) return carriers.length === 1 ? carriers[0] : undefined;
  const arfcn = validArfcn(measurement.cell.arfcn);
  if (arfcn === null) return undefined;
  const matches = carriers.filter((carrier) => carrierArfcn(carrier) === arfcn);
  return matches.length === 1 ? matches[0] : undefined;
}

function createSyntheticEvent(id: number, group: StandaloneGroup): NsgEvent {
  const { envelope, point } = group;
  return {
    id,
    name: "QualcommNrSa",
    marker: null,
    recordOffset: point.recordOffset,
    streamIndex: group.streamIndex,
    elapsedUs: point.elapsedUs,
    timestampUs: point.timestampUs,
    timestampMs: point.timestampMs,
    data: {
      event: "QualcommNrSa",
      source: "qualcomm-diag",
      nrMode: "SA",
      subId: envelope?.subId ?? null,
      slotId: envelope?.slotId ?? null,
      default: envelope?.isDefaultSubscription ?? null,
    },
  };
}

function createStandaloneCell(
  envelope: NsgCell | null,
  eventIndex: number,
  cellIndex: number,
  state: SaState,
  servingCell: TimedNrServingCellInfo | null,
  measurement: MeasurementContribution | null,
): NsgCell {
  const point = servingCell ?? measurement?.observation ?? state.configuration;
  const carrier = standaloneCarrier(state, measurement);
  const servingInfo = servingCell?.info;
  const decoded = measurement?.cell;
  const band = servingInfo ? validBand(servingInfo.band) : carrier ? validBand(carrier.band) : null;
  const nci = servingInfo ? canonicalNci(servingInfo.cellIdentity) : null;
  const registered = servingCell !== null || decoded?.serving === true;
  const raw: NsgJsonObject = {
    type: "nr",
    registered,
    source: "qualcomm-diag",
    nrMode: "SA",
    ...configurationProvenance(state.configuration),
  };
  if (envelope) raw.androidContextEventIndex = envelope.eventIndex;
  if (carrier) Object.assign(raw, carrierProvenance(carrier));
  if (servingCell) Object.assign(raw, servingProvenance(servingCell));
  if (measurement) Object.assign(raw, measurementProvenance(measurement));

  return {
    eventIndex,
    cellIndex,
    recordOffset: point.recordOffset,
    elapsedUs: point.elapsedUs,
    timestampUs: point.timestampUs,
    timestampMs: point.timestampMs,
    rat: "NR",
    registered,
    nrMode: "SA",
    sources: envelope ? ["qualcomm-diag", "android-telephony"] : ["qualcomm-diag"],
    subId: envelope?.subId ?? null,
    slotId: envelope?.slotId ?? null,
    isDefaultSubscription: envelope?.isDefaultSubscription ?? null,
    mcc: envelope?.mcc ?? null,
    mnc: envelope?.mnc ?? null,
    operatorName: envelope?.operatorName ?? null,
    lac: null,
    rnc: null,
    cid: null,
    tac: servingInfo ? validTac(servingInfo.tac) : null,
    nci,
    ...resolveNrIdentity(raw, nci),
    eci: null,
    pci: servingInfo ? validPci(servingInfo.physicalCellId) : decoded ? validPci(decoded.pci) : null,
    earfcn: null,
    arfcn: decoded ? validArfcn(decoded.arfcn) : carrier ? validArfcn(carrier.downlinkArfcn) : null,
    uarfcn: null,
    psc: null,
    bsic: null,
    dbm: null,
    rssi: null,
    rsrp: decoded && Number.isFinite(decoded.rsrp) ? decoded.rsrp : null,
    rsrq: decoded && Number.isFinite(decoded.rsrq) ? decoded.rsrq : null,
    sinr: null,
    ecno: null,
    ta: null,
    ber: null,
    bands: band === null ? null : [band],
    raw,
  };
}

function matchingMeasurementForServing(
  observations: readonly TimedNrMeasurement[],
  servingCell: TimedNrServingCellInfo,
  usedCells: ReadonlySet<QualcommNrMeasurementCell>,
): MeasurementContribution | null {
  const pci = validPci(servingCell.info.physicalCellId);
  if (pci === null) return null;
  let matched: MeasurementContribution | null = null;
  let matchedDistance = Number.POSITIVE_INFINITY;
  for (const observation of observations) {
    const distance = Math.abs(observation.elapsedUs - servingCell.elapsedUs);
    if (distance > ASSOCIATION_MAX_AGE_US || distance > matchedDistance) continue;
    const candidate = servingMeasurementCandidate(observation.measurement.cells, pci);
    if (candidate === null || usedCells.has(candidate)) continue;
    if (
      matched === null ||
      distance < matchedDistance ||
      (distance === matchedDistance && observation.recordOffset < matched.observation.recordOffset)
    ) {
      matched = { observation, cell: candidate };
      matchedDistance = distance;
    }
  }
  return matched;
}

export function fuseQualcommSaCells(
  cells: readonly NsgCell[],
  events: readonly NsgEvent[],
  configurations: readonly TimedNrConfigurationInfo[],
  servingCellInfos: readonly TimedNrServingCellInfo[],
  measurements: readonly TimedNrMeasurement[],
  lteAnchors: readonly LteAnchor[] = [],
  lteServingCellInfos: readonly TimedLteServingCellInfo[] = [],
  defaultDataSubscriptions: readonly DefaultDataSubscriptionChange[] = [],
): QualcommSaFusionResult {
  const timelines = buildConfigurationTimeline(configurations);
  const androidContexts = createAndroidNrContexts(cells, events);
  const subscriptionGroups = createSubscriptionGroups(androidContexts, cells);
  const { resolveContexts, resolveEvidenceContexts } = createContextResolvers(
    subscriptionGroups,
    cells,
    timelines,
    servingCellInfos,
    lteAnchors,
    lteServingCellInfos,
    defaultDataSubscriptions,
  );
  const resolveEvidenceLteAnchors = createNsaAnchorResolver(lteAnchors, lteServingCellInfos, defaultDataSubscriptions, {
    allowFallbacks: false,
  });
  const establishedContexts = createSaEventContexts(androidContexts, timelines, resolveContexts);
  const establishedEventIds = new Set(establishedContexts.map((context) => context.event.id));
  const contexts = [
    ...establishedContexts,
    ...createFutureSaEventContexts(androidContexts, cells, timelines, servingCellInfos).filter(
      (context) => !establishedEventIds.has(context.event.id),
    ),
  ];
  const contextsByState = groupContexts(contexts);
  const configuredEventIds = new Set(contexts.map((context) => context.event.id));
  const measurementsByEvent = new Map<number, TimedNrMeasurement>();
  const scheduleMeasurementsByEvent = new Map<number, Readonly<{ context: AndroidNrContext; observation: TimedNrMeasurement }>>();
  const measurementsByState = new Map<string, TimedNrMeasurement[]>();
  const remainingMeasurements: TimedNrMeasurement[] = [];

  for (const observation of measurements) {
    const indexedState = indexedStateAt(timelines, observation.streamIndex, observation);
    const state =
      indexedState === null || indexedState.epoch === null ? null : { configuration: indexedState.configuration, epoch: indexedState.epoch };
    if (state === null) {
      if (indexedState !== null) {
        remainingMeasurements.push(observation);
        continue;
      }
      const context = scheduleSaContextForMeasurement(androidContexts, cells, observation);
      if (context === null) {
        remainingMeasurements.push(observation);
        continue;
      }
      const futureState = futureSaStateAt(timelines, observation.streamIndex, observation);
      const futureKey = futureState === null ? null : stateKey(observation.streamIndex, futureState.epoch);
      const futureContexts = futureKey === null ? null : contextsByState.get(futureKey);
      if (futureState !== null && futureKey !== null && futureContexts?.some((candidate) => candidate.event.id === context.event.id)) {
        const stateMeasurements = measurementsByState.get(futureKey);
        if (stateMeasurements) stateMeasurements.push(observation);
        else measurementsByState.set(futureKey, [observation]);
        const current = measurementsByEvent.get(context.event.id);
        if (
          current === undefined ||
          Math.abs(context.event.elapsedUs - observation.elapsedUs) < Math.abs(context.event.elapsedUs - current.elapsedUs)
        )
          measurementsByEvent.set(context.event.id, observation);
        continue;
      }
      if (configuredEventIds.has(context.event.id)) {
        remainingMeasurements.push(observation);
        continue;
      }
      const current = scheduleMeasurementsByEvent.get(context.event.id);
      if (current === undefined || Math.abs(context.elapsedUs - observation.elapsedUs) < Math.abs(context.elapsedUs - current.observation.elapsedUs))
        scheduleMeasurementsByEvent.set(context.event.id, { context, observation });
      continue;
    }
    const key = stateKey(observation.streamIndex, state.epoch);
    const stateMeasurements = measurementsByState.get(key);
    if (stateMeasurements) stateMeasurements.push(observation);
    else measurementsByState.set(key, [observation]);
    const candidates = contextsByState.get(key);
    const context = candidates ? nearestRecord(candidates, observation) : null;
    if (context === null || Math.abs(context.event.elapsedUs - observation.elapsedUs) > ASSOCIATION_MAX_AGE_US) continue;
    const current = measurementsByEvent.get(context.event.id);
    if (current === undefined || Math.abs(context.event.elapsedUs - observation.elapsedUs) < Math.abs(context.event.elapsedUs - current.elapsedUs))
      measurementsByEvent.set(context.event.id, observation);
  }

  const servingByState = new Map<string, TimedNrServingCellInfo[]>();
  for (const servingCell of servingCellInfos) {
    if (servingCell.info.version !== 4) continue;
    let state = saStateAt(timelines, servingCell.streamIndex, servingCell);
    if (state === null) {
      const futureState = futureSaStateAt(timelines, servingCell.streamIndex, servingCell);
      const futureContexts = futureState === null ? null : contextsByState.get(stateKey(servingCell.streamIndex, futureState.epoch));
      const context = futureContexts ? scheduleSaContextForServingCell(futureContexts, cells, servingCell) : null;
      if (futureState !== null && context !== null && futureContexts?.some((candidate) => candidate.event.id === context.event.id))
        state = futureState;
    }
    if (state === null) continue;
    const key = stateKey(servingCell.streamIndex, state.epoch);
    const records = servingByState.get(key);
    if (records) records.push(servingCell);
    else servingByState.set(key, [servingCell]);
  }
  for (const records of servingByState.values()) records.sort(compareTimeline);

  const replacements = new Map<number, NsgCell>();
  const derivedByEvent = new Map<number, NsgCell[]>();
  const usedServingRecords = new Set<TimedNrServingCellInfo>();
  const usedMeasurementCells = new Set<QualcommNrMeasurementCell>();
  const maxCellIndexByEvent = new Map<number, number>();
  const lastPositionByEvent = new Map<number, number>();
  for (let position = 0; position < cells.length; position++) {
    const cell = cells[position];
    maxCellIndexByEvent.set(cell.eventIndex, Math.max(maxCellIndexByEvent.get(cell.eventIndex) ?? -1, cell.cellIndex));
    lastPositionByEvent.set(cell.eventIndex, position);
  }

  for (const { context, observation } of scheduleMeasurementsByEvent.values()) {
    const occupiedPositions = new Set<number>();
    const matchedMeasurements = new Set<QualcommNrMeasurementCell>();
    for (const serving of [true, false]) {
      for (const decoded of observation.measurement.cells) {
        if (decoded.serving !== serving) continue;
        const decodedPair = measurementPair(decoded);
        if (decodedPair === null) continue;
        const target = uniqueAvailablePairPosition(context.cellPositions, cells, decodedPair, occupiedPositions);
        if (target === null) continue;
        replacements.set(target, fuseScheduleSaCell(cells[target], { observation, cell: decoded }));
        occupiedPositions.add(target);
        matchedMeasurements.add(decoded);
      }
    }

    const envelope = cells[context.cellPositions[0]];
    let nextCellIndex = (maxCellIndexByEvent.get(context.event.id) ?? -1) + 1;
    const derivedPairs: NrPair[] = [];
    const derived: NsgCell[] = [];
    for (const decoded of observation.measurement.cells) {
      if (decoded.serving || matchedMeasurements.has(decoded)) continue;
      const decodedPair = measurementPair(decoded);
      if (decodedPair === null) continue;
      if (context.cellPositions.some((position) => samePair(cellPair(cells[position]), decodedPair))) continue;
      if (derivedPairs.some((candidate) => samePair(candidate, decodedPair))) continue;
      derived.push(createScheduleSaNeighbor(envelope, context.event, nextCellIndex++, { observation, cell: decoded }));
      derivedPairs.push(decodedPair);
    }
    if (derived.length > 0) derivedByEvent.set(context.event.id, derived);
  }

  for (const context of contexts) {
    const observation = measurementsByEvent.get(context.event.id) ?? null;
    const servingRecords = servingByState.get(stateKey(context.state.configuration.streamIndex, context.state.epoch));
    const nearestServing = servingRecords ? nearestRecord(servingRecords, context.event) : null;
    const servingCell =
      nearestServing !== null && Math.abs(nearestServing.elapsedUs - context.event.elapsedUs) <= ASSOCIATION_MAX_AGE_US ? nearestServing : null;
    const contributions = new Map<number, CellContributions>();
    for (const position of context.cellPositions) contributions.set(position, {});
    const servingMatch = servingPosition(context, cells, servingCell, observation);
    const servingPci = servingCell === null ? null : validPci(servingCell.info.physicalCellId);
    const servingMeasurement =
      observation !== null && servingPci !== null ? servingMeasurementCandidate(observation.measurement.cells, servingPci) : null;
    if (servingMatch !== null && servingCell !== null) {
      contributions.get(servingMatch)!.servingCell = servingCell;
      usedServingRecords.add(servingCell);
    }

    for (const carrier of context.state.configuration.configuration.activeCarriers) {
      const arfcn = carrierArfcn(carrier);
      if (arfcn === null) continue;
      let target = uniquePosition(context.cellPositions, cells, (cell) => cell.arfcn === arfcn);
      if (
        target === null &&
        servingMatch !== null &&
        observation?.measurement.cells.some((cell) => cell.arfcn === arfcn && (cell.serving || cell === servingMeasurement))
      )
        target = servingMatch;
      if (target !== null && contributions.get(target)?.carrier === undefined) contributions.get(target)!.carrier = carrier;
    }

    const matchedMeasurements = new Set<QualcommNrMeasurementCell>();
    const occupiedPositions = new Set<number>();
    if (
      servingMatch !== null &&
      servingCell !== null &&
      observation !== null &&
      observation.measurement.cells.some((cell) => cell.serving) &&
      servingMeasurement === null
    )
      occupiedPositions.add(servingMatch);
    if (observation !== null) {
      for (const serving of [true, false]) {
        for (const decoded of observation.measurement.cells) {
          if (decoded.serving !== serving) continue;
          const decodedPair = measurementPair(decoded);
          if (decodedPair === null) continue;
          let target: number | null = null;
          if (servingMatch !== null && decoded === servingMeasurement) target = servingMatch;
          if (target === null) target = uniqueAvailablePairPosition(context.cellPositions, cells, decodedPair, occupiedPositions);
          if (target === null || occupiedPositions.has(target)) continue;
          contributions.get(target)!.measurement = { observation, cell: decoded };
          occupiedPositions.add(target);
          matchedMeasurements.add(decoded);
          usedMeasurementCells.add(decoded);
        }
      }
    }

    for (const position of context.cellPositions) replacements.set(position, fuseCell(cells[position], context.state, contributions.get(position)!));

    if (observation === null) continue;
    const envelope = cells[context.cellPositions[0]];
    let nextCellIndex = (maxCellIndexByEvent.get(context.event.id) ?? -1) + 1;
    const derivedPairs: NrPair[] = [];
    const derived: NsgCell[] = [];
    for (const decoded of observation.measurement.cells) {
      if (decoded.serving || matchedMeasurements.has(decoded)) continue;
      const decodedPair = measurementPair(decoded);
      if (decodedPair === null) continue;
      if (context.cellPositions.some((position) => samePair(cellPair(cells[position]), decodedPair))) continue;
      if (derivedPairs.some((candidate) => samePair(candidate, decodedPair))) continue;
      const matchingCarriers = context.state.configuration.configuration.activeCarriers.filter(
        (carrier) => carrierArfcn(carrier) === decodedPair.arfcn,
      );
      const carrier = matchingCarriers.length === 1 ? matchingCarriers[0] : undefined;
      derived.push(createDerivedNeighbor(envelope, context.event, nextCellIndex++, context.state, { observation, cell: decoded }, carrier));
      derivedPairs.push(decodedPair);
      usedMeasurementCells.add(decoded);
    }
    if (derived.length > 0) derivedByEvent.set(context.event.id, derived);
  }

  const standaloneGroups: StandaloneGroup[] = [];
  for (const servingCell of servingCellInfos) {
    if (usedServingRecords.has(servingCell) || servingCell.info.version !== 4) continue;
    const state = saStateAt(timelines, servingCell.streamIndex, servingCell);
    if (state === null) continue;
    if (matchableNci(servingCell.info.cellIdentity) === null && validPci(servingCell.info.physicalCellId) === null) continue;
    const key = stateKey(servingCell.streamIndex, state.epoch);
    const measurement = matchingMeasurementForServing(measurementsByState.get(key) ?? [], servingCell, usedMeasurementCells);
    if (measurement) usedMeasurementCells.add(measurement.cell);
    const envelope = standaloneEnvelope(servingCell.streamIndex, servingCell, cells, resolveEvidenceContexts, resolveEvidenceLteAnchors);
    standaloneGroups.push({
      envelope,
      point: servingCell,
      state,
      streamIndex: servingCell.streamIndex,
      cells: [{ servingCell, measurement }],
    });
  }

  for (const observations of measurementsByState.values()) {
    for (const observation of observations) {
      const state = saStateAt(timelines, observation.streamIndex, observation);
      if (state === null) continue;
      const envelope = standaloneEnvelope(observation.streamIndex, observation, cells, resolveEvidenceContexts, resolveEvidenceLteAnchors);
      const seenPairs: NrPair[] = [];
      const standaloneDefinitions: StandaloneCellDefinition[] = [];
      for (const decoded of observation.measurement.cells) {
        if (usedMeasurementCells.has(decoded)) continue;
        const decodedPair = measurementPair(decoded);
        if (decodedPair === null || seenPairs.some((candidate) => samePair(candidate, decodedPair))) continue;
        standaloneDefinitions.push({ servingCell: null, measurement: { observation, cell: decoded } });
        seenPairs.push(decodedPair);
      }
      if (standaloneDefinitions.length > 0)
        standaloneGroups.push({
          envelope,
          point: observation,
          state,
          streamIndex: observation.streamIndex,
          cells: standaloneDefinitions,
        });
    }
  }

  standaloneGroups.sort((left, right) => compareTimeline(left.point, right.point));
  const syntheticEvents: NsgEvent[] = [];
  const standaloneCells: NsgCell[] = [];
  for (const group of standaloneGroups) {
    const eventIndex = events.length + syntheticEvents.length;
    syntheticEvents.push(createSyntheticEvent(eventIndex, group));
    for (let cellIndex = 0; cellIndex < group.cells.length; cellIndex++) {
      const definition = group.cells[cellIndex];
      standaloneCells.push(createStandaloneCell(group.envelope, eventIndex, cellIndex, group.state, definition.servingCell, definition.measurement));
    }
  }

  const fusedCells: NsgCell[] = [];
  for (let position = 0; position < cells.length; position++) {
    const cell = cells[position];
    fusedCells.push(replacements.get(position) ?? cell);
    if (lastPositionByEvent.get(cell.eventIndex) === position) fusedCells.push(...(derivedByEvent.get(cell.eventIndex) ?? []));
  }
  fusedCells.push(...standaloneCells);
  fusedCells.sort((left, right) => left.recordOffset - right.recordOffset || left.cellIndex - right.cellIndex);
  return { cells: fusedCells, syntheticEvents, remainingMeasurements };
}
