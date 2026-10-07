import type { ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { StationTitle } from "@/features/station-details/components/stationTitle";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

export function StationIdentityCell({
  className,
  stationId,
  countryCode,
  operator,
  fallback,
  onStationClick,
}: {
  className?: string;
  stationId: string | null;
  countryCode: string | null;
  operator: ComponentProps<typeof StationTitle>["operator"];
  fallback: string;
  onStationClick?: () => void;
}) {
  const { i18n } = useTranslation();

  const label = stationId ?? fallback;
  const title = (
    <>
      {countryCode && <CountryCodeTile code={countryCode} size="xs" label={getCountryName(countryCode, i18n.language)} />}
      {stationId || operator ? (
        <StationTitle stationId={label} operator={operator} stationIdClassName="group-hover/header:underline" />
      ) : (
        <span className="text-muted-foreground italic text-xs">{fallback}</span>
      )}
    </>
  );

  if (onStationClick) {
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
  }

  return <div className={cn("flex min-w-0 items-center gap-2", className)}>{title}</div>;
}
