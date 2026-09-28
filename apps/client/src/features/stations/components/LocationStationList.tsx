import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { StationStatusBadge } from "./StationStatusBadge";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { getStationBands } from "@/features/map/utils";
import { getOperatorColor, getOperatorTintGradient } from "@/lib/cellular/operators";
import type { StationWithoutCells } from "@/types/station";

type LocationStationLinkProps = {
  className: string;
  style: CSSProperties;
  children: ReactNode;
};

type LocationStationListProps = {
  stations: readonly StationWithoutCells[];
  renderLink: (station: StationWithoutCells, linkProps: LocationStationLinkProps) => ReactNode;
  className?: string;
};

export function LocationStationList({ stations, renderLink, className }: LocationStationListProps) {
  const { t } = useTranslation("main");

  if (stations.length === 0) return <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t("popup.noStations")}</div>;

  return (
    <ul className={className}>
      {stations.map((station) => {
        const mnc = station.operator?.mnc;
        const color = mnc ? getOperatorColor(mnc) : "#3b82f6";
        const bands = station.cells?.length ? getStationBands(station.cells) : [];
        return (
          <li key={station.id} className="border-b border-border/30 last:border-0">
            {renderLink(station, {
              className: "block px-3 py-2.5 transition-colors hover:bg-muted/50 sm:px-4 sm:py-3",
              style: { backgroundImage: getOperatorTintGradient(color) },
              children: (
                <>
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <div className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
                    <span className="text-sm font-medium">{station.operator?.name ?? t("unknownOperator")}</span>
                    <span className="font-mono text-xs text-foreground/70">{station.station_id}</span>
                    {station.extra_identificators?.networks_id ? (
                      <span className="font-mono text-xs text-foreground/70">N!{station.extra_identificators.networks_id}</span>
                    ) : null}
                    {station.status ? (
                      <StationStatusBadge status={station.status} statusChangedAt={station.statusChangedAt} className="ml-auto" />
                    ) : null}
                  </div>
                  {station.status !== "pending" && bands.length > 0 ? <TechnologySummary bands={bands} /> : null}
                </>
              ),
            })}
          </li>
        );
      })}
    </ul>
  );
}
