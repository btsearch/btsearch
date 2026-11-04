import { type NrPciCell, canShareNrPci } from "@openbts/shared/pciSharing";

export type PciDuplicateDetails = Record<string, unknown> & {
  pci?: number | null;
  enbid?: number | null;
  type?: "nsa" | "sa" | null;
};

export type PciDuplicateKeySource = {
  rat?: string | null;
  bandId?: number | null;
  details?: PciDuplicateDetails | null;
  sectorId?: number | null;
};

export type PciDuplicateKey = {
  rat: string;
  pci: number;
  key: string;
};

export type PciDuplicateSpec = {
  rat: string;
  channelField: string;
};

export const PCI_DUPLICATE_SPECS: PciDuplicateSpec[] = [
  { rat: "LTE", channelField: "earfcn" },
  { rat: "NR", channelField: "arfcn" },
];

export function getPciDuplicateSpec(rat: string | null | undefined): PciDuplicateSpec | undefined {
  return PCI_DUPLICATE_SPECS.find((spec) => spec.rat === rat);
}

export function getPciDuplicateKey(source: PciDuplicateKeySource): PciDuplicateKey | null {
  const spec = getPciDuplicateSpec(source.rat);
  if (!spec) return null;
  if (source.bandId === null || source.bandId === undefined || !source.details) return null;

  const { pci } = source.details;
  if (pci === null || pci === undefined) return null;

  const enbid = source.details.enbid;
  if (spec.rat === "LTE" && (enbid === null || enbid === undefined)) return null;

  const channel = source.details[spec.channelField];
  const channelKey = typeof channel === "number" ? channel.toString() : typeof channel === "string" ? channel : "";
  const nodeKey = spec.rat === "LTE" ? `${enbid}:` : "";
  return { rat: spec.rat, pci, key: `${source.bandId}:${nodeKey}${pci}:${channelKey}` };
}

function toNrPciCell(source: PciDuplicateKeySource): NrPciCell {
  return { mode: source.details?.type, sector: source.sectorId ?? null };
}

export function canSharePci(cell: PciDuplicateKeySource, other: PciDuplicateKeySource): boolean {
  return cell.rat === "NR" && canShareNrPci(toNrPciCell(cell), toNrPciCell(other));
}
