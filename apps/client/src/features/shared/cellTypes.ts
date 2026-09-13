import { CELL_TYPES, CELL_TYPE_SHORT_LABELS } from "@openbts/shared/cellTypes";

import type { CellType } from "@/types/station";

export { CELL_TYPES, CELL_TYPE_SHORT_LABELS };

export const DEFAULT_CELL_TYPE: CellType = "MACROCELL";

export function isCellType(value: unknown): value is CellType {
  return typeof value === "string" && CELL_TYPES.some((cellType) => cellType === value);
}

export const CELL_TYPE_LABELS = CELL_TYPE_SHORT_LABELS;

export const CELL_TYPE_I18N_KEY: Record<CellType, string> = {
  MACROCELL: "cellTypes.macrocell",
  MICROCELL: "cellTypes.microcell",
  PICOCELL: "cellTypes.picocell",
  FEMTOCELL: "cellTypes.femtocell",
};
