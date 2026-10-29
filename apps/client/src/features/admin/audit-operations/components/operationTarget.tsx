import { Link } from "@tanstack/react-router";

import type { AuditOperation } from "../types";
import { cn } from "@/lib/utils";

type OperationTargetProps = {
  operation: AuditOperation;
  targetLabel: string;
  className?: string;
};

export function OperationTarget({ operation, targetLabel, className }: OperationTargetProps) {
  const stationId = operation.stationIds.length === 1 ? operation.stationIds[0] : undefined;

  if (stationId !== undefined) {
    return (
      <Link
        to="/admin/stations/$id"
        params={{ id: String(stationId) }}
        search={{ officialSite: undefined }}
        className={cn(
          "pointer-events-auto rounded-sm text-xs font-mono text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        onClick={(event) => event.stopPropagation()}
      >
        {targetLabel}
      </Link>
    );
  }

  return <span className={cn("text-xs", targetLabel === "-" ? "text-muted-foreground" : "font-medium", className)}>{targetLabel}</span>;
}
