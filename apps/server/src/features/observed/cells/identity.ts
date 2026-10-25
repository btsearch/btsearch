export const CELLS_PER_ENB = 256;
export const NCI_BITS = 36;
export const MATCHED_FIELDS = ["areaCode", "pci", "channel"] as const;

export type MatchedField = (typeof MATCHED_FIELDS)[number];

export function isMatchedField(field: string): field is MatchedField {
  return MATCHED_FIELDS.some((matched) => matched === field);
}

export function gnbidOf(nci: number, gnbidLength: number): number {
  return Math.floor(nci / 2 ** (NCI_BITS - gnbidLength));
}
