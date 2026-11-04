import type { NrMode } from "./contract/cells.ts";

export type NrPciCell = { mode?: NrMode | null; sector: string | number | null };

export function canShareNrPci(cell: NrPciCell, other: NrPciCell): boolean {
  if ((cell.mode === "sa") === (other.mode === "sa")) return false;
  return cell.sector === null || other.sector === null || cell.sector === other.sector;
}
