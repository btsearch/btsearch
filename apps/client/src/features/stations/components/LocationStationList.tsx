import { useQuery } from "@tanstack/react-query";
import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { StationStatusBadge } from "./StationStatusBadge";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { getCellTechnologyBands } from "@/features/map/utils";
import { brandsQueryOptions } from "@/features/shared/lookups";
import type { LocationStationRecord } from "@/features/station-details/station/types";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { getNetworksIdLabel } from "@/features/station-details/station/utils/identifiers";
import { getStationNumber, toV1StationStatus } from "@/features/station-details/station/utils/stations";
import { getOperatorTintGradient } from "@/lib/cellular/operators";

type LocationStationLinkProps = {
  className: string;
  style: CSSProperties;
  children: ReactNode;
};

type LocationStationListProps<StationRow extends LocationStationRecord> = {
  stations: readonly StationRow[];
  renderLink: (station: StationRow, linkProps: LocationStationLinkProps) => ReactNode;
  className?: string;
};

export function LocationStationList<StationRow extends LocationStationRecord>({
  stations,
  renderLink,
  className,
}: LocationStationListProps<StationRow>): ReactNode {
  const { t } = useTranslation("main");
  const { data: brands } = useQuery(brandsQueryOptions());

  if (stations.length === 0) return <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t("popup.noStations")}</div>;

  return (
    <ul className={className}>
      {stations.map((station) => {
        const networksIdLabel = getNetworksIdLabel(station);
        const status = toV1StationStatus(station.status);
        const bands = getCellTechnologyBands(station.cells);
        const brand = getOperatorBrand(station.operator, brands);
        return (
          <li key={station.id} className="border-b border-border/30 last:border-0">
            {renderLink(station, {
              className: "block px-3 py-2.5 transition-colors hover:bg-muted/50 sm:px-4 sm:py-3",
              style: { backgroundImage: brand === null ? undefined : getOperatorTintGradient(brand.color) },
              children: (
                <>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {brand ? <div className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: brand.color }} /> : null}
                    <span className="text-sm font-medium">{station.operator?.name ?? t("unknownOperator")}</span>
                    <span className="font-mono text-xs text-foreground/70">{getStationNumber(station)}</span>
                    {networksIdLabel ? <span className="font-mono text-xs text-foreground/70">{networksIdLabel}</span> : null}
                    {status ? <StationStatusBadge status={status} statusChangedAt={station.statusChangedAt} className="ml-auto" /> : null}
                  </div>
                  {status !== "pending" && bands.length > 0 ? <TechnologySummary bands={bands} /> : null}
                </>
              ),
            })}
          </li>
        );
      })}
    </ul>
  );
}
