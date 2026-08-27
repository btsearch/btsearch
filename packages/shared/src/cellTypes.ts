export const CELL_TYPES = ["MACROCELL", "MICROCELL", "PICOCELL", "FEMTOCELL", "SMALLCELL"] as const;
export type CellType = (typeof CELL_TYPES)[number];

export const CELL_TYPE_SHORT_LABELS: Record<CellType, string> = {
  MACROCELL: "macro",
  MICROCELL: "micro",
  PICOCELL: "pico",
  FEMTOCELL: "femto",
  SMALLCELL: "small",
};
