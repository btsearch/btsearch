import type { CSSProperties, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { StationStatusBadge } from "./StationStatusBadge";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { getCellTechnologyBands, getStationBands } from "@/features/map/utils";
import type { LocationStationRecord } from "@/features/station-details/station/types";
import { FALLBACK_BRAND_COLOR } from "@/features/station-details/station/utils/brands";
import { NETWORKS_ID_KIND, findStationIdentifier, toV1OperatorMnc, toV1StationStatus } from "@/features/station-details/station/utils/stations";
import { getOperatorColor, getOperatorTintGradient } from "@/lib/cellular/operators";
import type { StationWithoutCells } from "@/types/station";

type LocationStationLinkProps = {
  className: string;
  style: CSSProperties;
  children: ReactNode;
};

type LocationStation = StationWithoutCells | LocationStationRecord;

type StationPresentation = {
  mnc: number | null;
  siteId: string;
  networksId: string | number | null;
  status: StationWithoutCells["status"];
  bands: readonly string[];
};

type LocationStationListProps<StationRow extends LocationStation> = {
  stations: readonly StationRow[];
  renderLink: (station: StationRow, linkProps: LocationStationLinkProps) => ReactNode;
  className?: string;
};

function toStationPresentation(station: LocationStation): StationPresentation {
  if ("siteId" in station)
    return {
      mnc: toV1OperatorMnc(station.operator),
      siteId: station.siteId,
      networksId: findStationIdentifier(station.identifiers, NETWORKS_ID_KIND),
      status: toV1StationStatus(station.status),
      bands: getCellTechnologyBands(station.cells),
    };

  return {
    mnc: station.operator?.mnc ?? null,
    siteId: station.station_id,
    networksId: station.extra_identificators?.networks_id ?? null,
    status: station.status,
    bands: station.cells?.length ? getStationBands(station.cells) : [],
  };
}

export function LocationStationList<StationRow extends LocationStation>({
  stations,
  renderLink,
  className,
}: LocationStationListProps<StationRow>): ReactNode {
  const { t } = useTranslation("main");

  if (stations.length === 0) return <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t("popup.noStations")}</div>;

  return (
    <ul className={className}>
      {stations.map((station) => {
        const { mnc, siteId, networksId, status, bands } = toStationPresentation(station);
        const color = mnc ? getOperatorColor(mnc) : FALLBACK_BRAND_COLOR;
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
                    <span className="font-mono text-xs text-foreground/70">{siteId}</span>
                    {networksId ? <span className="font-mono text-xs text-foreground/70">N!{networksId}</span> : null}
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
