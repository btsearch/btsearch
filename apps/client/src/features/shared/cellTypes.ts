import { CELL_TYPE_SHORT_LABELS } from "@openbts/shared/cellTypes";

import type { CellType } from "@/types/station";

export const CELL_TYPE_LABELS = CELL_TYPE_SHORT_LABELS;

export const CELL_TYPE_I18N_KEY: Record<CellType, string> = {
  MACROCELL: "cellTypes.macrocell",
  MICROCELL: "cellTypes.microcell",
  PICOCELL: "cellTypes.picocell",
  FEMTOCELL: "cellTypes.femtocell",
};
