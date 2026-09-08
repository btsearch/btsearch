import type { NsgCell } from "@/lib/nsg-parser/model";

export type NsaCarrierGroup = Readonly<{
  key: string;
  carrierIndex: number | null;
  role: "primary" | "secondary" | "unknown";
  serving: readonly NsgCell[];
  neighbors: readonly NsgCell[];
}>;

export type NsaAggregation = Readonly<{
  anchors: readonly NsgCell[];
  carriers: readonly NsaCarrierGroup[];
}>;

type MutableCarrierGroup = {
  key: string;
  carrierIndex: number | null;
  role: "primary" | "secondary" | "unknown";
  serving: NsgCell[];
  neighbors: NsgCell[];
};

type NsaCarrierRoleLabelKey = "snapshot.nrPrimaryCell" | "snapshot.nrSecondaryCell" | "snapshot.nrCell";

function rawNonNegativeInteger(cell: NsgCell, key: string): number | null {
  const value = cell.raw[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function compareCarrierGroups(left: NsaCarrierGroup, right: NsaCarrierGroup): number {
  if (left.carrierIndex === null) return right.carrierIndex === null ? 0 : 1;
  if (right.carrierIndex === null) return -1;
  return left.carrierIndex - right.carrierIndex;
}

function carrierRole(carrierIndex: number | null): NsaCarrierGroup["role"] {
  if (carrierIndex === null) return "unknown";
  return carrierIndex === 0 ? "primary" : "secondary";
}

export function getNsaCarrierRoleLabelKey(role: NsaCarrierGroup["role"]): NsaCarrierRoleLabelKey {
  switch (role) {
    case "primary":
      return "snapshot.nrPrimaryCell";
    case "secondary":
      return "snapshot.nrSecondaryCell";
    case "unknown":
      return "snapshot.nrCell";
  }
}

export function createNsaAggregation(cells: readonly NsgCell[]): NsaAggregation | null {
  const anchors: NsgCell[] = [];
  const carriersByKey = new Map<string, MutableCarrierGroup>();

  for (const cell of cells) {
    if (cell.measurementRole === "lte-secondary") {
      anchors.push(cell);
      continue;
    }
    if (cell.measurementRole !== "nr-primary" && cell.measurementRole !== "nr-neighbor") continue;

    const carrierIndex = rawNonNegativeInteger(cell, "carrierIndex");
    const key = carrierIndex === null ? "unknown" : String(carrierIndex);
    let carrier = carriersByKey.get(key);
    if (!carrier) {
      carrier = { key, carrierIndex, role: carrierRole(carrierIndex), serving: [], neighbors: [] };
      carriersByKey.set(key, carrier);
    }
    if (cell.measurementRole === "nr-primary") carrier.serving.push(cell);
    else carrier.neighbors.push(cell);
  }

  const carriers = [...carriersByKey.values()].sort(compareCarrierGroups);
  return anchors.length === 0 && carriers.length === 0 ? null : { anchors, carriers };
}

export function isNsaAggregationCell(cell: NsgCell): boolean {
  return cell.measurementRole === "lte-secondary" || cell.measurementRole === "nr-primary" || cell.measurementRole === "nr-neighbor";
}
