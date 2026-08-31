import { cn } from "@/lib/utils";

import { DialogOperatorName } from "./dialogOperatorName";

type StationTitleProps = {
  stationId: string;
  operator?: {
    name: string;
    mnc?: number | null;
  };
  stationIdClassName?: string;
};

export function StationTitle({ stationId, operator, stationIdClassName }: StationTitleProps) {
  return (
    <>
      {operator ? <DialogOperatorName name={operator.name} mnc={operator.mnc} compact /> : null}
      <span className={cn("shrink-0 font-mono text-sm font-medium text-foreground tabular-nums", stationIdClassName)}>{stationId}</span>
    </>
  );
}
