import { Globe02Icon, Location01Icon, MapsLocation01Icon, MountainIcon, Radar01Icon, Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { fetchElevation, fetchPemReports } from "../api";
import { CopyButton } from "./copyButton";
import { ExtraIdentificatorsDisplay, hasExtraIdentificators } from "./extraIdentificators";
import { NavigationLinks } from "./navLinks";
import { SI2PEMReportsMenu } from "./si2pemReportsMenu";
import { StationInfoItem, StationInfoItemSkeleton } from "./stationInfoItem";
import { StationUplinkItem } from "./stationUplinkItem";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePreferences } from "@/hooks/usePreferences";
import { formatCoordinates } from "@/lib/geo/coordinates";
import type { ExtraIdentificator, Region, StationSource, StationUplink } from "@/types/station";

const stationInfoGridClassName =
  "grid grid-flow-row-dense grid-cols-1 gap-4 @md:grid-cols-2 @lg:gap-x-6 @3xl:has-[>*>:nth-child(3)]:grid-cols-3 @3xl:has-[>*>:only-child]:grid-cols-3";

const stationInfoGroupClassName = "grid grid-cols-subgrid gap-y-4 @md:has-[>:nth-child(2)]:col-span-2 @3xl:has-[>:nth-child(3)]:col-span-3";

const stationInfoCardClassName = "space-y-4 rounded-xl border p-3 @lg:p-4";

const stationInfoLinksClassName = "flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3";

type StationInfoGridProps = {
  stationCode: string;
  operator: { name: string; mnc?: number | null };
  location?: { id: number; latitude: number; longitude: number; region?: Region | null } | null;
  showPemReports?: boolean;
  uplink?: StationUplink;
  extraIdentificators?: ExtraIdentificator;
};

export function StationInfoGrid({ stationCode, operator, location, showPemReports = true, uplink, extraIdentificators }: StationInfoGridProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const { preferences } = usePreferences();
  const isPemEnabled = showPemReports && !!stationCode && !!location && typeof operator.mnc === "number";
  const isElevationEnabled = !!location && preferences.showElevation;

  const {
    data: pemReports,
    isPending: isPemPending,
    refetch: refetchPemReports,
  } = useQuery({
    queryKey: ["station-pem", stationCode, location?.latitude, location?.longitude, operator.mnc],
    queryFn: () => fetchPemReports(stationCode, location!.latitude, location!.longitude, operator.mnc!),
    staleTime: 1000 * 60 * 60,
    enabled: isPemEnabled,
    retry: false,
  });

  const { data: elevation, isPending: isElevationPending } = useQuery({
    queryKey: ["elevation", location?.latitude, location?.longitude],
    queryFn: () => fetchElevation(location!.latitude, location!.longitude),
    staleTime: 1000 * 60 * 60 * 24,
    enabled: isElevationEnabled,
    retry: false,
  });

  return (
    <div className={stationInfoGridClassName}>
      {location ? (
        <div className={stationInfoGroupClassName}>
          <StationInfoItem icon={<HugeiconsIcon icon={Location01Icon} className="size-4" />} label={t("common:labels.coordinates")}>
            <span className="font-mono wrap-break-word">{formatCoordinates(location.latitude, location.longitude, preferences.gpsFormat)}</span>
            {preferences.navLinksDisplay === "inline" && (
              <NavigationLinks latitude={location.latitude} longitude={location.longitude} displayMode="inline" className="flex" />
            )}
            <CopyButton text={`${location.latitude}, ${location.longitude}`} />
          </StationInfoItem>
          <StationInfoItem icon={<HugeiconsIcon icon={Globe02Icon} className="size-4" />} label={t("common:labels.region")}>
            <span>{location.region?.name || "-"}</span>
          </StationInfoItem>
          {isElevationEnabled ? (
            <StationInfoItem icon={<HugeiconsIcon icon={MountainIcon} className="size-4" />} label={t("common:labels.elevation")}>
              {isElevationPending ? <Skeleton className="h-4 w-12 rounded" /> : <span>{elevation === undefined ? "-" : `${elevation} m`}</span>}
            </StationInfoItem>
          ) : null}
        </div>
      ) : null}
      <div className={stationInfoGroupClassName}>
        <StationInfoItem icon={<HugeiconsIcon icon={Tag01Icon} className="size-4" />} label={t("common:labels.stationId")}>
          <span className="font-mono">{stationCode}</span>
          <CopyButton text={stationCode} />
        </StationInfoItem>
        {uplink ? <StationUplinkItem uplink={uplink} /> : null}
        {isPemEnabled ? (
          <StationInfoItem icon={<HugeiconsIcon icon={Radar01Icon} className="size-4" />} label={t("specs.pemReports")}>
            <SI2PEMReportsMenu
              reports={pemReports}
              isLoading={isPemPending}
              onRetry={refetchPemReports}
              latitude={location.latitude}
              longitude={location.longitude}
              operatorName={operator.name}
              operatorMnc={operator.mnc}
            />
          </StationInfoItem>
        ) : null}
      </div>
      {hasExtraIdentificators(extraIdentificators) ? (
        <div className={stationInfoGroupClassName}>
          <ExtraIdentificatorsDisplay data={extraIdentificators} operatorMnc={operator.mnc} />
        </div>
      ) : null}
    </div>
  );
}

function useStationInfoLinks() {
  const { preferences } = usePreferences();
  const isOnMap = useLocation({ select: ({ pathname }) => pathname === "/" || pathname.startsWith("/lists/") });

  return {
    preferences,
    showMapLink: !isOnMap,
    navigationApps: preferences.navLinksDisplay === "buttons" ? preferences.navigationApps : [],
  };
}

type StationInfoCardProps = StationInfoGridProps & {
  source: StationSource;
  onClose: () => void;
};

export function StationInfoCard({ source, onClose, ...gridProps }: StationInfoCardProps) {
  const { t } = useTranslation("stationDetails");
  const { showMapLink, navigationApps } = useStationInfoLinks();
  const { location } = gridProps;
  const mapFilter = source === "uke" ? "fu" : "f";

  return (
    <section className="@container">
      <div className={stationInfoCardClassName}>
        <StationInfoGrid {...gridProps} />
        {location && (showMapLink || navigationApps.length > 0) ? (
          <div className={stationInfoLinksClassName}>
            {showMapLink && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      to="/"
                      hash={`map=16/${location.latitude}/${location.longitude}~${mapFilter}~L${location.id}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-background text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      onClick={onClose}
                    />
                  }
                >
                  <HugeiconsIcon icon={MapsLocation01Icon} className="size-3.5" />
                  {t("common:actions.showOnMap")}
                </TooltipTrigger>
                <TooltipContent>{t("common:actions.showOnMap")}</TooltipContent>
              </Tooltip>
            )}
            {navigationApps.length > 0 && <NavigationLinks latitude={location.latitude} longitude={location.longitude} displayMode="buttons" />}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function StationInfoCardSkeleton() {
  const { preferences, showMapLink, navigationApps } = useStationInfoLinks();
  const hasInlineNavLinks = preferences.navLinksDisplay === "inline" && preferences.navigationApps.length > 0;

  return (
    <section className="@container">
      <div className={stationInfoCardClassName}>
        <div className={stationInfoGridClassName}>
          <div className={stationInfoGroupClassName}>
            <StationInfoItemSkeleton valueClassName="w-36" lineClassName={hasInlineNavLinks ? "h-6" : "h-5.5"} />
            <StationInfoItemSkeleton valueClassName="w-24" />
            {preferences.showElevation ? <StationInfoItemSkeleton valueClassName="w-12" /> : null}
          </div>
          <div className={stationInfoGroupClassName}>
            <StationInfoItemSkeleton valueClassName="w-20" lineClassName="h-5.5" />
            <StationInfoItemSkeleton valueClassName="w-20" />
          </div>
        </div>
        {showMapLink || navigationApps.length > 0 ? (
          <div className={stationInfoLinksClassName}>
            {showMapLink ? <Skeleton className="h-6.5 w-28" /> : null}
            {navigationApps.map((app) => (
              <Skeleton key={app} className="h-6.5 w-24" />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
