import { DialogOperatorName } from "./dialogOperatorName";
import { HighlightedText } from "@/features/shared/HighlightedText";
import { cn } from "@/lib/utils";

type StationTitleProps = {
  stationId: string;
  operator?: {
    name: string;
    mnc?: number | null;
  };
  stationIdClassName?: string;
  highlight?: string;
};

export function StationTitle({ stationId, operator, stationIdClassName, highlight }: StationTitleProps) {
  return (
    <>
      {operator ? <DialogOperatorName name={operator.name} mnc={operator.mnc} compact /> : null}
      <span className={cn("shrink-0 font-mono text-sm font-medium text-foreground tabular-nums", stationIdClassName)}>
        {highlight ? <HighlightedText text={stationId} query={highlight} /> : stationId}
      </span>
    </>
  );
}
