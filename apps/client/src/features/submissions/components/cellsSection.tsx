import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { EmptyPanel } from "@/components/empty-panel";
import { RAT_ORDER } from "@/features/shared/rat";
import type { SectorDraft } from "@/types/station";

import type { ProposedCellForm, RatType } from "../types";
import type { CellError } from "../utils/validation";
import { CellDetailsForm } from "./cellDetailsForm";

export interface CellsSectionProps {
  selectedRats: RatType[];
  cells: ProposedCellForm[];
  originalCells: ProposedCellForm[];
  sectors: SectorDraft[];
  isNewStation: boolean;
  cellErrors?: Record<string, CellError>;
  onCellsChange: (rat: RatType, cells: ProposedCellForm[]) => void;
  operatorMnc?: number | null;
}

export function CellsSection({
  selectedRats,
  cells,
  originalCells,
  sectors,
  isNewStation,
  cellErrors,
  onCellsChange,
  operatorMnc,
}: CellsSectionProps) {
  const { t } = useTranslation(["submissions", "common"]);

  const cellsByRat = useMemo(() => {
    const map = new Map<RatType, ProposedCellForm[]>();
    for (const cell of cells) {
      const list = map.get(cell.rat) ?? [];
      list.push(cell);
      map.set(cell.rat, list);
    }
    return map;
  }, [cells]);

  if (selectedRats.length === 0) {
    return <EmptyPanel>{t("ratSelector.noSelection")}</EmptyPanel>;
  }

  return (
    <div className="space-y-3 pb-4">
      {RAT_ORDER.filter((rat) => selectedRats.includes(rat)).map((rat) => (
        <CellDetailsForm
          key={rat}
          rat={rat}
          cells={cellsByRat.get(rat) ?? []}
          originalCells={originalCells}
          sectors={sectors}
          isNewStation={isNewStation}
          cellErrors={cellErrors}
          onCellsChange={onCellsChange}
          operatorMnc={operatorMnc}
        />
      ))}
    </div>
  );
}
