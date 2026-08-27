import { CELL_TYPES, CELL_TYPE_SHORT_LABELS } from "@openbts/shared/cellTypes";

import type { CellType } from "@/types/station";

export { CELL_TYPES, CELL_TYPE_SHORT_LABELS };

export const CELL_TYPE_LABELS = CELL_TYPE_SHORT_LABELS;

export const CELL_TYPE_COLORS: Record<CellType, string> = {
  MACROCELL: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-500/20",
  MICROCELL: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border border-violet-500/20",
  PICOCELL: "bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20",
  FEMTOCELL: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20",
  SMALLCELL: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20",
};

export const CELL_TYPE_I18N_KEY: Record<CellType, string> = {
  MACROCELL: "cellTypes.macrocell",
  MICROCELL: "cellTypes.microcell",
  PICOCELL: "cellTypes.picocell",
  FEMTOCELL: "cellTypes.femtocell",
  SMALLCELL: "cellTypes.smallcell",
};
