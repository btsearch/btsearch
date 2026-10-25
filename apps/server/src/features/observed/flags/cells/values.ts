import type { CellApplyUpdate, CellNetworkMatch, CountryFeatures } from "@openbts/shared/contract";

import { SHARED_AREA_FIELDS, isSwitchedOff } from "../../../analyzer/match.js";
import { disabledCountryFeatures } from "../../../stations/countryFeatures.js";
import type { CellRows } from "../../../stations/serialize.js";
import { MATCHED_FIELDS, type MatchedField } from "../../cells/identity.js";
import type { FlagFindings } from "../kinds.js";
import { type FlagKey, cellFieldSubject } from "../subjects.js";
import { type Sighting, confirmedValues, mostRecent } from "./sightings.js";

export type ObservedValueRow = Sighting & { cellId: number; networkMatch: CellNetworkMatch; field: MatchedField; value: number };

type ValueFlagInput = {
  cells: readonly CellRows[];
  values: readonly ObservedValueRow[];
  featuresByStation: ReadonlyMap<number, CountryFeatures>;
  seenSince: string;
};
type ValueKind = "valueDiffers" | "valueMissing";
type CellField = "tac" | "lac" | "pci" | "psc" | "bsic" | "earfcn" | "arfcn" | "uarfcn";
type StoredValue = { field: CellField; stored: number | null };

function storedAs(field: CellField, stored: number | null): StoredValue {
  return { field, stored };
}

function radioValues(areaCode: StoredValue, pci: StoredValue, channel: StoredValue): Record<MatchedField, StoredValue> {
  return { areaCode, pci, channel };
}

function storedValues({ cell, gsm, umts, lte, nr }: CellRows): Partial<Record<MatchedField, StoredValue>> {
  if (cell.rat === "LTE" && lte) return radioValues(storedAs("tac", lte.tac), storedAs("pci", lte.pci), storedAs("earfcn", lte.earfcn));
  if (cell.rat === "NR" && nr) return radioValues(storedAs("tac", nr.nrtac), storedAs("pci", nr.pci), storedAs("arfcn", nr.arfcn));
  if (cell.rat === "UMTS" && umts) return radioValues(storedAs("lac", umts.lac), storedAs("psc", umts.psc), storedAs("uarfcn", umts.arfcn));
  if (cell.rat === "GSM" && gsm) return { pci: storedAs("bsic", gsm.bsic) };
  return {};
}

function countsFor(networkMatch: CellNetworkMatch, field: CellField): boolean {
  if (networkMatch === "partner") return false;
  return networkMatch === "own" || !SHARED_AREA_FIELDS.has(field);
}

function judgeField(row: CellRows, field: MatchedField, seen: readonly ObservedValueRow[], features: CountryFeatures, seenSince: string) {
  const storedValue = storedValues(row)[field];
  if (storedValue === undefined || isSwitchedOff(storedValue.field, features)) return null;

  const { field: cellField, stored } = storedValue;
  const confirmed = confirmedValues(
    seen.filter((value) => value.field === field && countsFor(value.networkMatch, cellField)),
    seenSince,
  );
  const best = mostRecent(confirmed);
  if (best === undefined) return null;
  return { cellField, stored, best, agrees: confirmed.some(({ value }) => value === stored) };
}

export function raiseValueFlags({ cells, values, featuresByStation, seenSince }: ValueFlagInput): FlagFindings<ValueKind> {
  const valuesByCell = Map.groupBy(values, (row) => row.cellId);
  const findings: FlagFindings<ValueKind> = { raised: [], fixed: [] };
  for (const row of cells) {
    const { id: cellId, station_id: stationId } = row.cell;
    const features = featuresByStation.get(stationId) ?? disabledCountryFeatures;
    const seen = valuesByCell.get(cellId) ?? [];

    for (const field of MATCHED_FIELDS) {
      const judged = judgeField(row, field, seen, features, seenSince);
      if (judged === null) continue;

      const subjectKey = cellFieldSubject(cellId, field);
      findings.fixed.push(...(["valueDiffers", "valueMissing"] as const).map((kind): FlagKey => ({ kind, subjectKey })));
      if (judged.agrees) continue;

      const { cellField, stored, best } = judged;
      const change: CellApplyUpdate = { action: "update", id: cellId };
      change[cellField] = best.value;
      const finding = {
        subjectKey,
        refs: { stationId, cellId, observedCellId: best.observedCellId, observedSiteId: best.observedSiteId },
        evidence: { field, observed: best.value, stored, samples: best.samples, people: best.people, lastSeenOn: best.lastSeenOn },
        suggestion: { cells: [change] },
        measure: { value: best.value, people: best.people },
      };
      findings.raised.push(stored === null ? { kind: "valueMissing", ...finding } : { kind: "valueDiffers", ...finding });
    }
  }
  return findings;
}
