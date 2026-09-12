import type { TFunction } from "i18next";

import type { RatType } from "../../types";
import { RatCellsTableHeader } from "@/features/shared/RatCellsTableHeader";

type CellsTableHeadersProps = {
  rat: RatType;
  tStation: TFunction<"translation", undefined>;
  showSectors?: boolean;
};

export function CellsTableHeaders({ rat, tStation, showSectors }: CellsTableHeadersProps) {
  return <RatCellsTableHeader rat={rat} t={tStation} showSectors={showSectors} showConfirmed={false} />;
}
