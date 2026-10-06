import { Globe02Icon, Location01Icon, MountainIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { fetchElevation } from "../../../api";
import { CopyButton } from "../../../components/copyButton";
import { NavigationLinks } from "../../../components/navLinks";
import { StationInfoItem } from "../../../components/stationInfoItem";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { Skeleton } from "@/components/ui/skeleton";
import { usePreferences } from "@/hooks/usePreferences";
import { formatCoordinates } from "@/lib/geo/coordinates";
import { getCountryName } from "@/lib/geo/countryName";

const ELEVATION_STALE_TIME = 1000 * 60 * 60 * 24;

type CoordinatesProps = {
  latitude: number;
  longitude: number;
};

type RegionItemProps = {
  countryCode: string;
  regionName: string;
};

export function CoordinatesItem({ latitude, longitude }: CoordinatesProps) {
  const { t } = useTranslation("common");
  const { preferences } = usePreferences();

  return (
    <StationInfoItem icon={<HugeiconsIcon icon={Location01Icon} aria-hidden="true" className="size-4" />} label={t("labels.coordinates")}>
      <span className="font-mono wrap-break-word">{formatCoordinates(latitude, longitude, preferences.gpsFormat)}</span>
      {preferences.navLinksDisplay === "inline" ? (
        <NavigationLinks latitude={latitude} longitude={longitude} displayMode="inline" className="flex" />
      ) : null}
      <CopyButton text={`${latitude}, ${longitude}`} />
    </StationInfoItem>
  );
}

export function RegionItem({ countryCode, regionName }: RegionItemProps) {
  const { t, i18n } = useTranslation("stationDetails");

  return (
    <StationInfoItem icon={<HugeiconsIcon icon={Globe02Icon} aria-hidden="true" className="size-4" />} label={t("specs.region")}>
      <CountryCodeTile code={countryCode} size="xs" label={getCountryName(countryCode, i18n.language)} />
      <span>{regionName}</span>
    </StationInfoItem>
  );
}

export function ElevationItem({ latitude, longitude }: CoordinatesProps) {
  const { t } = useTranslation("common");
  const { preferences } = usePreferences();
  const { data: elevation, isPending } = useQuery({
    queryKey: ["elevation", latitude, longitude],
    queryFn: () => fetchElevation(latitude, longitude),
    staleTime: ELEVATION_STALE_TIME,
    enabled: preferences.showElevation,
    retry: false,
  });

  if (!preferences.showElevation) return null;

  const elevationText = elevation === undefined ? "-" : `${elevation} m`;

  return (
    <StationInfoItem icon={<HugeiconsIcon icon={MountainIcon} aria-hidden="true" className="size-4" />} label={t("labels.elevation")}>
      {isPending ? <Skeleton className="h-4 w-12 rounded" /> : <span>{elevationText}</span>}
    </StationInfoItem>
  );
}
