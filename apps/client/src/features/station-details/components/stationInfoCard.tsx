import { Globe02Icon, Location01Icon, MapsLocation01Icon, MountainIcon, Radar01Icon, Tag01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";

import { fetchElevation, fetchPemReports } from "../api";
import { CopyButton } from "./copyButton";
import { ExtraIdentificatorsDisplay, hasExtraIdentificators } from "./extraIdentificators";
import { NavigationLinks } from "./navLinks";
import { SI2PEMReportsMenu } from "./si2pemReportsMenu";
import { StationInfoItem } from "./stationInfoItem";
import { StationUplinkItem } from "./stationUplinkItem";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePreferences } from "@/hooks/usePreferences";
import { formatCoordinates } from "@/lib/geo/coordinates";
import type { ExtraIdentificator, Region, StationSource, StationUplink } from "@/types/station";

const stationInfoGridClassName =
  "grid grid-flow-row-dense grid-cols-1 gap-4 @md:grid-cols-2 @lg:gap-x-6 @3xl:has-[>*>:nth-child(3)]:grid-cols-3 @3xl:has-[>*>:only-child]:grid-cols-3";

const stationInfoGroupClassName = "grid grid-cols-subgrid gap-y-4 @md:has-[>:nth-child(2)]:col-span-2 @3xl:has-[>:nth-child(3)]:col-span-3";

type StationInfoGridProps = {
  stationCode: string;
  operator: { name: string; mnc?: number | null };
  location?: { id: number; latitude: number; longitude: number; region?: Region | null } | null;
  showPemReports?: boolean;
  uplink?: StationUplink;
  extraIdentificators?: ExtraIdentificator;
  onLayoutChange?: () => void;
};

export function StationInfoGrid({
  stationCode,
  operator,
  location,
  showPemReports = true,
  uplink,
  extraIdentificators,
  onLayoutChange,
}: StationInfoGridProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const { preferences } = usePreferences();

  const { data: pemReports } = useQuery({
    queryKey: ["station-pem", stationCode, location?.latitude, location?.longitude, operator.mnc],
    queryFn: () => fetchPemReports(stationCode, location!.latitude, location!.longitude, operator.mnc!),
    staleTime: 1000 * 60 * 60,
    enabled: showPemReports && !!stationCode && !!location && typeof operator.mnc === "number",
    retry: false,
  });

  const { data: elevation } = useQuery({
    queryKey: ["elevation", location?.latitude, location?.longitude],
    queryFn: () => fetchElevation(location!.latitude, location!.longitude),
    staleTime: 1000 * 60 * 60 * 24,
    enabled: !!location && preferences.showElevation,
    retry: false,
  });

  useLayoutEffect(() => {
    onLayoutChange?.();
  }, [pemReports?.length, elevation, onLayoutChange]);

  return (
    <div className={stationInfoGridClassName}>
      {location ? (
        <div className={stationInfoGroupClassName}>
          <StationInfoItem icon={<HugeiconsIcon icon={Location01Icon} className="size-4" />} label={t("common:labels.coordinates")}>
            <span className="font-mono wrap-break-word">{formatCoordinates(location.latitude, location.longitude, preferences.gpsFormat)}</span>
            {preferences.navLinksDisplay === "inline" && (
              <NavigationLinks latitude={location.latitude} longitude={location.longitude} displayMode="inline" />
            )}
            <CopyButton text={`${location.latitude}, ${location.longitude}`} />
          </StationInfoItem>
          <StationInfoItem icon={<HugeiconsIcon icon={Globe02Icon} className="size-4" />} label={t("common:labels.region")}>
            <span>{location.region?.name || "-"}</span>
          </StationInfoItem>
          {elevation !== undefined && (
            <StationInfoItem icon={<HugeiconsIcon icon={MountainIcon} className="size-4" />} label={t("common:labels.elevation")}>
              <span>{elevation} m</span>
            </StationInfoItem>
          )}
        </div>
      ) : null}
      <div className={stationInfoGroupClassName}>
        <StationInfoItem icon={<HugeiconsIcon icon={Tag01Icon} className="size-4" />} label={t("common:labels.stationId")}>
          <span className="font-mono">{stationCode}</span>
          <CopyButton text={stationCode} />
        </StationInfoItem>
        {uplink ? <StationUplinkItem uplink={uplink} /> : null}
        {location && pemReports && pemReports.length > 0 ? (
          <StationInfoItem icon={<HugeiconsIcon icon={Radar01Icon} className="size-4" />} label={t("specs.pemReports")}>
            <SI2PEMReportsMenu
              reports={pemReports}
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

type StationInfoCardProps = StationInfoGridProps & {
  source: StationSource;
  onClose: () => void;
};

export function StationInfoCard({ source, onClose, ...gridProps }: StationInfoCardProps) {
  const { t } = useTranslation("stationDetails");
  const { preferences } = usePreferences();
  const isOnMap = useLocation({ select: ({ pathname }) => pathname === "/" || pathname.startsWith("/lists/") });
  const { location } = gridProps;
  const showNavigationButtons = preferences.navLinksDisplay === "buttons" && preferences.navigationApps.length > 0;
  const mapFilter = source === "uke" ? "fu" : "f";

  return (
    <section className="@container">
      <div className="space-y-4 rounded-xl border p-3 @lg:p-4">
        <StationInfoGrid {...gridProps} />
        {location && (!isOnMap || showNavigationButtons) ? (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
            {!isOnMap && (
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
                  {t("dialog.showOnMap")}
                </TooltipTrigger>
                <TooltipContent>{t("dialog.showOnMap")}</TooltipContent>
              </Tooltip>
            )}
            {showNavigationButtons && <NavigationLinks latitude={location.latitude} longitude={location.longitude} displayMode="buttons" />}
          </div>
        ) : null}
      </div>
    </section>
  );
}
