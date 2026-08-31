import { StationTitle } from "@/features/station-details/components/stationTitle";
import type { Operator } from "@/types/station";

export function StationIdentityCell({
  stationId,
  operator,
  fallback,
  onStationClick,
}: {
  stationId: string | null;
  operator: Operator | undefined;
  fallback: string;
  onStationClick?: () => void;
}) {
  if (!stationId && !operator) return <span className="text-muted-foreground italic text-xs">{fallback}</span>;

  const label = stationId ?? fallback;
  const title = <StationTitle stationId={label} operator={operator} stationIdClassName="group-hover/header:underline" />;

  if (onStationClick)
    return (
      <button
        type="button"
        className="group/header flex min-w-0 cursor-pointer items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onStationClick}
      >
        {title}
      </button>
    );

  return <div className="flex min-w-0 items-center gap-2">{title}</div>;
}
