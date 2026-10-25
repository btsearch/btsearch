import type { ObservedCellRecord } from "@openbts/shared/contract";

export function readObservedCellPci(record: ObservedCellRecord): number | null {
  return record.rat === "lte" || record.rat === "nr" ? record.pci : null;
}

export function describeObservedCellNumber(record: ObservedCellRecord): string {
  return record.rat === "lte" || record.rat === "nr" ? `CLID ${record.clid}` : `CID ${record.cid}`;
}
