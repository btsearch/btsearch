import type { Operator } from "@openbts/shared/contract";
import type { TFunction } from "i18next";
import { useCallback, useContext } from "react";
import { useTranslation } from "react-i18next";

import { formatValue } from "./display";
import { type ResolvedOperator, getCellOperator } from "@/features/nsg-explorer/cells/operators";
import { OperatorBrandCatalogContext } from "@/features/shared/operatorBrandCatalog";
import { findOperatorForPlmn } from "@/features/shared/operatorBrands";
import type { NsgCell } from "@/lib/nsg-parser/model";

type SimCell = Pick<NsgCell, "slotId" | "simPlmn" | "isDefaultSubscription">;

function formatPlmn(plmn: string): string {
  return `${plmn.slice(0, 3)} ${plmn.slice(3)}`;
}

function withDataMarker(cell: SimCell, label: string, t: TFunction<"nsg">): string {
  return cell.isDefaultSubscription === true ? `${label} ${t("labels.dataSim")}` : label;
}

export function getCellrecSimLabel(cell: SimCell, operators: readonly Operator[] | undefined, t: TFunction<"nsg">): string | null {
  if (cell.simPlmn === undefined) return null;
  const slot = formatValue(cell.slotId);
  const network = cell.simPlmn === null ? null : (findOperatorForPlmn(operators, cell.simPlmn)?.name ?? formatPlmn(cell.simPlmn));
  return withDataMarker(cell, network === null ? t("labels.sim", { slot }) : t("labels.simNetwork", { slot, network }), t);
}

export function getCellrecSimTag(cell: SimCell, t: TFunction<"nsg">): string | null {
  return cell.simPlmn === undefined ? null : withDataMarker(cell, t("labels.sim", { slot: formatValue(cell.slotId) }), t);
}

export function getCellrecSimOperator(cell: SimCell): ResolvedOperator | null {
  return typeof cell.simPlmn === "string" ? getCellOperator({ mcc: cell.simPlmn.slice(0, 3), mnc: cell.simPlmn.slice(3) }) : null;
}

export function useCellrecSimLabel(): (cell: SimCell) => string | null {
  const { t } = useTranslation("nsg");
  const { operators } = useContext(OperatorBrandCatalogContext);
  return useCallback((cell: SimCell) => getCellrecSimLabel(cell, operators, t), [operators, t]);
}
