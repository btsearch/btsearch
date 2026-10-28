import type { StatisticsOperator } from "../../lib/operators";
import { ColorBar } from "./colorBar";
import { BrandMark } from "@/components/cellular/brandMark";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LEGEND_MARK_SIZE = 14;

type OperatorLegendProps = {
  operators: readonly StatisticsOperator[];
  selectedId?: number | null;
  onSelect?: (operatorId: number | null) => void;
};

function LegendMarks({ operator, isDimmed }: { operator: StatisticsOperator; isDimmed: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 transition-opacity", isDimmed && "opacity-30")}>
      <ColorBar color={operator.color} className="h-3" />
      <BrandMark brand={operator.brand} size={LEGEND_MARK_SIZE} showFallback={false} />
    </span>
  );
}

export function OperatorLegend({ operators, selectedId = null, onSelect }: OperatorLegendProps) {
  if (operators.length === 0) return null;

  if (onSelect === undefined) {
    return (
      <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
        {operators.map((operator) => (
          <li key={operator.id} className="inline-flex h-5 items-center gap-1.5 text-xs whitespace-nowrap text-muted-foreground">
            <LegendMarks operator={operator} isDimmed={false} />
            {operator.name}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <ul className="-ml-2 flex flex-wrap items-center gap-x-1 gap-y-0.5">
      {operators.map((operator) => {
        const isSelected = selectedId === operator.id;
        return (
          <li key={operator.id}>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-pressed={isSelected}
              className="cursor-pointer gap-1.5 font-normal text-muted-foreground aria-pressed:bg-muted aria-pressed:text-foreground"
              onClick={() => onSelect(isSelected ? null : operator.id)}
            >
              <LegendMarks operator={operator} isDimmed={selectedId !== null && !isSelected} />
              {operator.name}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
