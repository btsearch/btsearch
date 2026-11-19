import type { Operator } from "@openbts/shared/contract";
import type { TFunction } from "i18next";
import { useCallback, useContext } from "react";
import { useTranslation } from "react-i18next";

import { formatValue } from "./display";
import { OperatorBrandCatalogContext } from "@/features/shared/operatorBrandCatalog";
import { findOperatorForPlmn } from "@/features/shared/operatorBrands";
import type { NsgCell } from "@/lib/nsg-parser/model";

type SimCell = Pick<NsgCell, "slotId" | "simPlmn" | "isDefaultSubscription">;

function formatPlmn(plmn: string): string {
  return `${plmn.slice(0, 3)} ${plmn.slice(3)}`;
}

export function getCellrecSimLabel(cell: SimCell, operators: readonly Operator[] | undefined, t: TFunction<"nsg">): string | null {
  if (cell.simPlmn === undefined) return null;
  const slot = formatValue(cell.slotId);
  const network = cell.simPlmn === null ? null : (findOperatorForPlmn(operators, cell.simPlmn)?.name ?? formatPlmn(cell.simPlmn));
  const label = network === null ? t("labels.sim", { slot }) : t("labels.simNetwork", { slot, network });
  return cell.isDefaultSubscription === true ? `${label} ${t("labels.dataSim")}` : label;
}

export function useCellrecSimLabel(): (cell: SimCell) => string | null {
  const { t } = useTranslation("nsg");
  const { operators } = useContext(OperatorBrandCatalogContext);
  return useCallback((cell: SimCell) => getCellrecSimLabel(cell, operators, t), [operators, t]);
}
