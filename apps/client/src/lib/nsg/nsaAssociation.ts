import { QUALCOMM_NR_MEASUREMENT_LOG_CODE, type QualcommNrMeasurement } from "./qualcommNr";
import type { NsgCell, NsgJsonObject, NsgTimestamp } from "./types";

const ASSOCIATION_MAX_AGE_US = 1_000_000;

export type LteAnchor = Readonly<{
  cell: NsgCell;
  derivedCellIndexOffset: number;
}>;

export type TimedNrMeasurement = NsgTimestamp &
  Readonly<{
    recordOffset: number;
    measurement: QualcommNrMeasurement;
  }>;

export type NsaAssociation = Readonly<{
  anchor: NsgCell;
  derivedCells: readonly NsgCell[];
}>;

type AssociatedNrMeasurement = Readonly<{
  observation: TimedNrMeasurement;
  distanceUs: number;
}>;

function subscriptionKey(anchor: LteAnchor): string | null {
  const { slotId, subId } = anchor.cell;
  if (slotId === null && subId === null) return null;
  return `${slotId ?? "?"}:${subId ?? "?"}`;
}

function associationAnchors(anchors: readonly LteAnchor[]): LteAnchor[] {
  const defaultAnchors = anchors.filter((anchor) => anchor.cell.isDefault === true);
  if (defaultAnchors.length > 0) return defaultAnchors;

  const subscriptionKeys = new Set(anchors.map(subscriptionKey).filter((key): key is string => key !== null));
  if (subscriptionKeys.size !== 1) return [];
  const [onlySubscriptionKey] = subscriptionKeys;
  return anchors.filter((anchor) => subscriptionKey(anchor) === onlySubscriptionKey);
}

function nearestAnchor(anchors: readonly LteAnchor[], elapsedUs: number): LteAnchor | null {
  let low = 0;
  let high = anchors.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (anchors[middle].cell.elapsedUs < elapsedUs) low = middle + 1;
    else high = middle;
  }

  if (low === 0) return anchors[0] ?? null;
  if (low === anchors.length) return anchors.at(-1) ?? null;
  return elapsedUs - anchors[low - 1].cell.elapsedUs <= anchors[low].cell.elapsedUs - elapsedUs ? anchors[low - 1] : anchors[low];
}

function createDerivedCells(anchor: LteAnchor, observation: TimedNrMeasurement): NsgCell[] {
  const neighbors: NsgCell[] = [];
  const primaryCells: NsgCell[] = [];

  for (let cellIndex = 0; cellIndex < observation.measurement.cells.length; cellIndex++) {
    const decoded = observation.measurement.cells[cellIndex];
    const measurementRole = decoded.serving ? "nr-primary" : "nr-neighbor";
    const raw: NsgJsonObject = {
      type: "nr",
      registered: decoded.serving ? null : false,
      source: "qualcomm-diag",
      measurementRole: decoded.serving ? "nr-primary" : "neighbor",
      diagLogCode: `0x${QUALCOMM_NR_MEASUREMENT_LOG_CODE.toString(16).toUpperCase()}`,
      diagVersion: `${observation.measurement.versionMajor}.${observation.measurement.versionMinor}`,
      diagRecordOffset: observation.recordOffset,
      diagElapsedUs: observation.elapsedUs,
      diagTimestampUs: observation.timestampUs,
      carrierIndex: decoded.carrierIndex,
      carrierCellIndex: decoded.cellIndex,
      ccId: decoded.ccId,
      pci: decoded.pci,
      arfcn: decoded.arfcn,
      sfn: decoded.sfn,
      beamCount: decoded.beamCount,
      rsrp: decoded.rsrp,
      rsrq: decoded.rsrq,
      mcc: anchor.cell.mcc,
      mnc: anchor.cell.mnc,
    };
    const cell: NsgCell = {
      eventIndex: anchor.cell.eventIndex,
      cellIndex: anchor.derivedCellIndexOffset + cellIndex,
      recordOffset: anchor.cell.recordOffset,
      elapsedUs: anchor.cell.elapsedUs,
      timestampUs: anchor.cell.timestampUs,
      timestampMs: anchor.cell.timestampMs,
      rat: "NR",
      registered: decoded.serving ? null : false,
      measurementRole,
      subId: anchor.cell.subId,
      slotId: anchor.cell.slotId,
      isDefault: anchor.cell.isDefault,
      mcc: anchor.cell.mcc,
      mnc: anchor.cell.mnc,
      lac: null,
      cid: null,
      tac: null,
      eci: null,
      pci: decoded.pci,
      earfcn: null,
      arfcn: decoded.arfcn,
      uarfcn: null,
      psc: null,
      bsic: null,
      dbm: null,
      rssi: null,
      rsrp: decoded.rsrp,
      rsrq: decoded.rsrq,
      sinr: null,
      ta: null,
      ber: null,
      raw,
    };
    if (decoded.serving) primaryCells.push(cell);
    else neighbors.push(cell);
  }

  return [...neighbors, ...primaryCells];
}

export function associateQualcommNsaMeasurements(anchors: readonly LteAnchor[], observations: readonly TimedNrMeasurement[]): NsaAssociation[] {
  if (anchors.length === 0 || observations.length === 0) return [];

  const eligibleAnchors = associationAnchors(anchors).sort(
    (left, right) => left.cell.elapsedUs - right.cell.elapsedUs || left.cell.eventIndex - right.cell.eventIndex,
  );
  const observationsByEvent = new Map<number, AssociatedNrMeasurement>();

  for (const observation of observations) {
    const anchor = nearestAnchor(eligibleAnchors, observation.elapsedUs);
    if (anchor === null) continue;
    const distanceUs = Math.abs(anchor.cell.elapsedUs - observation.elapsedUs);
    if (distanceUs > ASSOCIATION_MAX_AGE_US) continue;
    const current = observationsByEvent.get(anchor.cell.eventIndex);
    if (
      current === undefined ||
      distanceUs < current.distanceUs ||
      (distanceUs === current.distanceUs && observation.elapsedUs < current.observation.elapsedUs)
    )
      observationsByEvent.set(anchor.cell.eventIndex, { observation, distanceUs });
  }

  const associations: NsaAssociation[] = [];
  for (const anchor of anchors) {
    const association = observationsByEvent.get(anchor.cell.eventIndex);
    if (association === undefined) continue;
    associations.push({ anchor: anchor.cell, derivedCells: createDerivedCells(anchor, association.observation) });
  }
  return associations;
}

export function mergeAssociatedNsaCells(cells: readonly NsgCell[], associations: readonly NsaAssociation[]): NsgCell[] {
  if (associations.length === 0) return [...cells];
  const derivedCellsByEvent = new Map(associations.map(({ anchor, derivedCells }) => [anchor.eventIndex, derivedCells]));
  const mergedCells: NsgCell[] = [];

  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index];
    mergedCells.push(cell);
    if (cells[index + 1]?.eventIndex === cell.eventIndex) continue;
    const derivedCells = derivedCellsByEvent.get(cell.eventIndex);
    if (derivedCells) mergedCells.push(...derivedCells);
  }
  return mergedCells;
}
