import type { NsgCell } from "@/lib/nsg-parser/model";

export type NsaCarrierRole = "primary" | "secondary" | "unknown";
export type NrDeploymentMode = "NSA" | "SA";

export type NsaCarrierGroup = Readonly<{
  key: string;
  carrierIndex: number | null;
  role: NsaCarrierRole;
  serving: readonly NsgCell[];
  neighbors: readonly NsgCell[];
}>;

export type NsaAggregation = Readonly<{
  anchors: readonly NsgCell[];
  carriers: readonly NsaCarrierGroup[];
}>;

export type NsaPresentationSection =
  | Readonly<{
      kind: "nr-serving";
      key: string;
      carrierKey: string;
      role: NsaCarrierRole;
      cell: NsgCell;
      showRadioContext: boolean;
    }>
  | Readonly<{
      kind: "nr-neighbors";
      key: string;
      carrierKey: string;
      role: NsaCarrierRole;
      cells: readonly NsgCell[];
    }>
  | Readonly<{
      kind: "lte-anchor";
      key: "lte-anchor";
      cells: readonly NsgCell[];
    }>;

type MutableCarrierGroup = {
  key: string;
  carrierIndex: number | null;
  role: NsaCarrierRole;
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

function carrierRole(carrierIndex: number | null): NsaCarrierRole {
  if (carrierIndex === null) return "unknown";
  return carrierIndex === 0 ? "primary" : "secondary";
}

export function getNsaCarrierRoleLabelKey(role: NsaCarrierRole): NsaCarrierRoleLabelKey {
  switch (role) {
    case "primary":
      return "snapshot.nrPrimaryCell";
    case "secondary":
      return "snapshot.nrSecondaryCell";
    case "unknown":
      return "snapshot.nrCell";
  }
}

export function getNsaCarrierRoleAbbreviation(role: NsaCarrierRole): "PC" | "SC" | null {
  switch (role) {
    case "primary":
      return "PC";
    case "secondary":
      return "SC";
    case "unknown":
      return null;
  }
}

export function getNeighborTechnologySuffix(rat: string, nrMode?: NrDeploymentMode): string | null {
  if (rat === "NR") return nrMode ?? null;
  if (rat === "LTE") return null;
  return rat;
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

export function createNsaPresentationSections(aggregation: NsaAggregation): readonly NsaPresentationSection[] {
  const sections: NsaPresentationSection[] = [];

  for (const carrier of aggregation.carriers) {
    for (const cell of carrier.serving) {
      sections.push({
        kind: "nr-serving",
        key: `nr-serving:${carrier.key}:${cell.recordOffset}:${cell.cellIndex}`,
        carrierKey: carrier.key,
        role: carrier.role,
        cell,
        showRadioContext: sections.length === 0,
      });
    }
  }

  for (const carrier of aggregation.carriers) {
    if (carrier.neighbors.length === 0) continue;
    sections.push({
      kind: "nr-neighbors",
      key: `nr-neighbors:${carrier.key}`,
      carrierKey: carrier.key,
      role: carrier.role,
      cells: carrier.neighbors,
    });
  }

  if (aggregation.anchors.length > 0) sections.push({ kind: "lte-anchor", key: "lte-anchor", cells: aggregation.anchors });
  return sections;
}

export function isNsaAggregationCell(cell: NsgCell): boolean {
  return cell.measurementRole === "lte-secondary" || cell.measurementRole === "nr-primary" || cell.measurementRole === "nr-neighbor";
}
