import { StationTitle } from "@/features/station-details/components/stationTitle";
import { cn } from "@/lib/utils";
import type { Operator } from "@/types/station";

export function StationIdentityCell({
  className,
  stationId,
  operator,
  fallback,
  onStationClick,
}: {
  className?: string;
  stationId: string | null;
  operator: Operator | undefined;
  fallback: string;
  onStationClick?: () => void;
}) {
  if (!stationId && !operator) return <span className={cn("text-muted-foreground italic text-xs", className)}>{fallback}</span>;

  const label = stationId ?? fallback;
  const title = <StationTitle stationId={label} operator={operator} stationIdClassName="group-hover/header:underline" />;

  if (onStationClick)
    return (
      <button
        type="button"
        className={cn(
          "group/header flex min-w-0 cursor-pointer items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
        onClick={onStationClick}
      >
        {title}
      </button>
    );

  return <div className={cn("flex min-w-0 items-center gap-2", className)}>{title}</div>;
}
