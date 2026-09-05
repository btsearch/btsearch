import { Globe02Icon, Location01Icon, MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createLocationSEOMetadata, parseSEOEntityId } from "@openbts/shared/seo";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { CollapsibleSection } from "@/components/content/collapsibleSection";
import { EntityPageMessage, entityPageChipClassName } from "@/components/content/entityPage";
import { PhotoStrip } from "@/components/photos/photoStrip";
import { fetchLocationWithStations, locationQueryKey } from "@/features/map/api";
import { TechnologySummary } from "@/features/map/components/technologySummary";
import { getStationBands } from "@/features/map/utils";
import { fetchLocationPhotos } from "@/features/station-details/api";
import { CopyButton } from "@/features/station-details/components/copyButton";
import { NavigationLinks } from "@/features/station-details/components/navLinks";
import { ShareButton } from "@/features/station-details/components/shareButton";
import { stationDialogHeaderIconActionClassName } from "@/features/station-details/components/stationDialogHeaderStyles";
import { StationInfoItem } from "@/features/station-details/components/stationInfoItem";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import { usePreferences } from "@/hooks/usePreferences";
import { APP_NAME, ApiResponseError } from "@/lib/api";
import { getOperatorColor } from "@/lib/cellular/operators";
import { formatCoordinates } from "@/lib/geo/coordinates";
import { queryClient } from "@/lib/queryClient";
import { buildPageHead, getBrowserOrigin } from "@/lib/seo";
import type { LocationWithStations } from "@/types/station";

const ignorePrefetchError = () => undefined;

const locationPageQueryOptions = (id: number) =>
  queryOptions({
    queryKey: locationQueryKey(id),
    queryFn: () => fetchLocationWithStations(id),
    staleTime: 1000 * 60 * 2,
  });

const locationPhotosQueryOptions = (id: number) =>
  queryOptions({
    queryKey: ["location-photos", id] as const,
    queryFn: () => fetchLocationPhotos(id),
    staleTime: 1000 * 60 * 5,
  });

function locationLabel(location: LocationWithStations, fallbackCity: string): string {
  const city = location.city || fallbackCity;
  return location.address ? `${city}, ${location.address}` : city;
}

function locationHead(location: LocationWithStations) {
  return buildPageHead(
    createLocationSEOMetadata(
      { name: APP_NAME, url: getBrowserOrigin() },
      {
        id: location.id,
        city: location.city,
        address: location.address,
        regionName: location.region.name,
        latitude: location.latitude,
        longitude: location.longitude,
        stations: location.stations.map((station) => ({
          id: station.id,
          stationCode: station.station_id,
          operatorName: station.operator?.name,
          status: station.status,
        })),
      },
    ),
  );
}

function LocationPage() {
  const { id } = Route.useParams();
  const locationId = Number(id);
  const { t } = useTranslation(["stationDetails", "main", "nav", "common"]);
  const { preferences } = usePreferences();

  const { data: location } = useQuery(locationPageQueryOptions(locationId));
  const { data: photos = [] } = useQuery(locationPhotosQueryOptions(locationId));

  if (!location) return <EntityPageMessage titleKey="page.locationUnavailableTitle" descriptionKey="page.locationUnavailableDescription" />;

  const city = location.city || t("page.unknownLocation");
  const label = locationLabel(location, city);
  const mapHash = `map=16/${location.latitude}/${location.longitude}~f~L${location.id}`;

  return (
    <main className="w-full px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <header className="overflow-hidden rounded-2xl border border-border/70 bg-background">
        <div className="relative flex items-start gap-3 px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex-1 min-w-0 space-y-1.5">
            <h1 className="min-w-0 text-lg font-semibold leading-6 tracking-tight text-foreground sm:text-xl">
              {city}
              {location.region ? <span className="ml-2 text-sm font-normal text-muted-foreground">· {location.region.name}</span> : null}
            </h1>
            {location.address ? <p className="text-sm leading-5 text-muted-foreground">{location.address}</p> : null}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <span className="font-mono text-[11px] text-muted-foreground/80">
                GPS: {formatCoordinates(location.latitude, location.longitude, preferences.gpsFormat)}
              </span>
              <CopyButton text={`${location.latitude}, ${location.longitude}`} />
            </div>
          </div>
          <div className="absolute top-3 right-3 flex shrink-0 items-center gap-0.5 sm:static sm:-mt-1 sm:-mr-2">
            <ShareButton
              title={label}
              text={t("page.locationShareText", { location: label })}
              url={`${window.location.origin}/locations/${location.id}`}
              size="md"
              className={stationDialogHeaderIconActionClassName}
            />
          </div>
        </div>
        {photos.length > 0 ? (
          <div className="border-t px-4 py-3 sm:px-6">
            <PhotoStrip photos={photos} />
          </div>
        ) : null}
      </header>

      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-start">
        <aside className="min-w-0 space-y-5 sm:space-y-6 lg:col-start-2">
          <CollapsibleSection title={t("page.info")}>
            <div className="space-y-4">
              <StationInfoItem icon={<HugeiconsIcon icon={Location01Icon} className="size-4" />} label={t("common:labels.coordinates")}>
                <span className="font-mono break-all">{formatCoordinates(location.latitude, location.longitude, preferences.gpsFormat)}</span>
                <CopyButton text={`${location.latitude}, ${location.longitude}`} />
                {preferences.navLinksDisplay === "inline" && (
                  <NavigationLinks latitude={location.latitude} longitude={location.longitude} displayMode="inline" />
                )}
              </StationInfoItem>
              <StationInfoItem icon={<HugeiconsIcon icon={Globe02Icon} className="size-4" />} label={t("common:labels.region")}>
                <span>{location.region?.name || "-"}</span>
              </StationInfoItem>
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
                <Link to="/" hash={mapHash} className={entityPageChipClassName}>
                  <HugeiconsIcon icon={MapsLocation01Icon} className="size-3.5" />
                  {t("dialog.showOnMap")}
                </Link>
                {preferences.navLinksDisplay === "buttons" && preferences.navigationApps.length > 0 && (
                  <NavigationLinks latitude={location.latitude} longitude={location.longitude} displayMode="buttons" />
                )}
              </div>
            </div>
          </CollapsibleSection>
        </aside>

        <div className="min-w-0 space-y-5 sm:space-y-6 lg:col-start-1 lg:row-start-1">
          <CollapsibleSection title={t("page.stationsAtLocation")}>
            {location.stations.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">{t("main:popup.noStations")}</div>
            ) : (
              <ul className="overflow-hidden rounded-xl border">
                {location.stations.map((station) => {
                  const mnc = station.operator?.mnc;
                  const color = mnc ? getOperatorColor(mnc) : "#3b82f6";
                  const bands = station.cells?.length ? getStationBands(station.cells) : [];
                  return (
                    <li key={station.id} className="border-b border-border/30 last:border-0">
                      <Link
                        to="/stations/$id"
                        params={{ id: String(station.id) }}
                        className="block px-3 py-2.5 transition-colors hover:bg-muted/50 sm:px-4 sm:py-3"
                        style={{ backgroundImage: `linear-gradient(115deg, ${color}18 0%, ${color}08 38%, transparent 72%)` }}
                      >
                        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <div className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: color }} />
                          <span className="text-sm font-medium">{station.operator?.name ?? t("main:unknownOperator")}</span>
                          <span className="font-mono text-xs text-foreground/70">{station.station_id}</span>
                          {station.extra_identificators?.networks_id ? (
                            <span className="font-mono text-xs text-foreground/70">N!{station.extra_identificators.networks_id}</span>
                          ) : null}
                          {station.status ? (
                            <StationStatusBadge status={station.status} statusChangedAt={station.statusChangedAt} className="ml-auto" />
                          ) : null}
                        </div>
                        {station.status !== "pending" && bands.length > 0 ? <TechnologySummary bands={bands} /> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CollapsibleSection>
        </div>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_layout/locations/$id")({
  component: LocationPage,
  loader: async ({ params }) => {
    const id = parseSEOEntityId(params.id);
    if (id === null) throw notFound();
    void queryClient.query(locationPhotosQueryOptions(id)).catch(ignorePrefetchError);
    try {
      return await queryClient.query({ ...locationPageQueryOptions(id), staleTime: "static" });
    } catch (error) {
      if (error instanceof ApiResponseError && error.status === 404) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => (loaderData ? locationHead(loaderData) : { meta: [{ name: "robots", content: "noindex" }] }),
  notFoundComponent: () => <EntityPageMessage titleKey="page.locationNotFoundTitle" descriptionKey="page.locationNotFoundDescription" />,
  errorComponent: () => <EntityPageMessage titleKey="page.locationUnavailableTitle" descriptionKey="page.locationUnavailableDescription" />,
});
