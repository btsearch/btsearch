import { getOperatorColor } from "@/lib/operatorUtils";
import { cn } from "@/lib/utils";
import type { Operator } from "@/types/station";

const FALLBACK_OPERATOR_COLOR = "#00E1FF";

export function StationIdentityCell({
  stationId,
  operator,
  fallback,
  onStationClick,
  layout = "stacked",
}: {
  stationId: string | null;
  operator: Operator | undefined;
  fallback: string;
  onStationClick?: () => void;
  layout?: "stacked" | "inline";
}) {
  if (!stationId && !operator) return <span className="text-muted-foreground italic text-xs">{fallback}</span>;

  const operatorMnc = operator?.mnc;
  const color = operatorMnc !== null && operatorMnc !== undefined ? getOperatorColor(operatorMnc) : FALLBACK_OPERATOR_COLOR;
  const label = stationId ?? fallback;
  const inline = layout === "inline";

  const stationLabelClassName = cn("font-mono text-sm font-medium", inline ? "shrink-0 whitespace-nowrap" : "block max-w-full truncate");

  const stationLabel = onStationClick ? (
    <button type="button" onClick={onStationClick} className={cn(stationLabelClassName, "text-left hover:underline cursor-pointer")}>
      {label}
    </button>
  ) : (
    <span className={stationLabelClassName}>{label}</span>
  );

  if (inline) {
    return (
      <div className="flex items-center gap-2 min-w-0">
        <div className="size-3 rounded-[2px] shrink-0" style={{ backgroundColor: color }} />
        {stationLabel}
        {operator ? <span className="text-xs text-muted-foreground truncate">({operator.name})</span> : null}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 min-w-0">
      <div className="size-3 rounded-[2px] shrink-0 mt-1" style={{ backgroundColor: color }} />
      <div className="min-w-0">
        {stationLabel}
        <div className="text-xs text-muted-foreground truncate">{operator?.name ?? "-"}</div>
      </div>
    </div>
  );
}
