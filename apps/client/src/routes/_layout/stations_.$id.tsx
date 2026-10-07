import {
  Alert02Icon,
  Clock01Icon,
  Location01Icon,
  MapsLocation01Icon,
  Note01Icon,
  PencilEdit02Icon,
  SearchRemoveIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createStationSEOMetadata, parseSEOEntityId } from "@openbts/shared/seo";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { AzimuthCompass } from "@/components/cellular/azimuthCompass";
import { CollapsibleSection } from "@/components/content/collapsibleSection";
import { EntityNotFound, EntityRouteError, entityPageChipClassName } from "@/components/content/entityPage";
import { PhotoStrip } from "@/components/photos/photoStrip";
import { InlineError, StaleDataNotice } from "@/components/ui/error-state";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { getStationHistoryTriggerId } from "@/features/floating-dialogs/types";
import { AddToListPopover } from "@/features/lists/components/addToListPopover";
import { getStationMapHash } from "@/features/map/mapLinks";
import { brandsQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import { CommentsList } from "@/features/station-details/components/commentsList";
import { NavigationLinks } from "@/features/station-details/components/navLinks";
import { PermitsList } from "@/features/station-details/components/permitsList";
import { ShareButton } from "@/features/station-details/components/shareButton";
import {
  StationDialogActionBar,
  stationDialogInlineActionClassName,
  stationDialogInlineActionLabelClassName,
} from "@/features/station-details/components/stationDialogActionBar";
import { stationDialogHeaderIconActionClassName } from "@/features/station-details/components/stationDialogHeaderStyles";
import { WatchButton } from "@/features/station-details/components/watchButton";
import { locationRecordQueryOptions, stationPhotoRecordsQueryOptions, stationRecordQueryOptions } from "@/features/station-details/station/api";
import { StationCellTables } from "@/features/station-details/station/components/cells/stationCellTables";
import { StationOverviewGrid } from "@/features/station-details/station/components/overview/stationOverviewCard";
import { HostStationLink } from "@/features/station-details/station/components/panel/hostStationLink";
import { StationPanelHeading } from "@/features/station-details/station/components/panel/stationPanelHeading";
import { listShownPhotos } from "@/features/station-details/station/components/photos/stationPhotos";
import type { Sector, StationRecord } from "@/features/station-details/station/types";
import { getBrandColor, getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { formatSectorAzimuth } from "@/features/station-details/station/utils/sectors";
import {
  NETWORKS_ID_KIND,
  findHostStation,
  findStationIdentifier,
  toV1OperatorMnc,
  toV1StationStatus,
} from "@/features/station-details/station/utils/stations";
import { usePreferences } from "@/hooks/usePreferences";
import { settingsQueryOptions, useSettings } from "@/hooks/useSettings";
import { i18n } from "@/i18n";
import { APP_NAME, ApiResponseError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { getOperatorHeaderTintGradient } from "@/lib/cellular/operators";
import { queryClient } from "@/lib/queryClient";
import { buildPageHead, getBrowserOrigin } from "@/lib/seo";

type StationSectorsCompassProps = {
  sectors: readonly Sector[];
  color: string;
};

function stationHead(station: StationRecord) {
  const networksId = findStationIdentifier(station.identifiers, NETWORKS_ID_KIND);
  const numericNetworksId = networksId === null ? null : Number(networksId);

  return buildPageHead(
    createStationSEOMetadata(
      { name: APP_NAME, url: getBrowserOrigin() },
      {
        id: station.id,
        stationCode: station.siteId,
        status: toV1StationStatus(station.status),
        operatorName: station.operator?.name ?? i18n.t("main:unknownOperator"),
        operatorMnc: toV1OperatorMnc(station.operator),
        networksId: numericNetworksId !== null && Number.isFinite(numericNetworksId) ? numericNetworksId : null,
        city: station.location?.city,
        address: station.location?.address,
        regionName: station.location?.region.name,
        latitude: station.location?.latitude,
        longitude: station.location?.longitude,
        bands: station.cells.map((cell) => ({ rat: cell.rat, value: cell.band?.labelMhz ?? null })),
      },
    ),
  );
}

function StationNotFound() {
  return <EntityNotFound icon={SearchRemoveIcon} titleKey="page.stationNotFoundTitle" descriptionKey="page.stationNotFoundDescription" />;
}

function StationRouteError() {
  return <EntityRouteError titleKey="page.stationUnavailableTitle" descriptionKey="common:error.tryLater" />;
}

function StationSectorsCompass({ sectors, color }: StationSectorsCompassProps) {
  const { t } = useTranslation("stationDetails");
  const directions = sectors.map((sector) => ({ azimuth: sector.azimuth, name: formatSectorAzimuth(sector.azimuth, t) }));

  return <AzimuthCompass directions={directions} color={color} className="size-56 sm:size-60" />;
}

function StationPage() {
  const { id } = Route.useParams();
  const stationId = Number(id);
  const { t } = useTranslation(["stationDetails", "common", "stations", "nav", "main"]);
  const { t: tCommon } = useTranslation("common");
  const { data: settings } = useSettings();
  const { data: session } = authClient.useSession();
  const { preferences } = usePreferences();
  const { openStationDialog, openStationHistoryDialog } = useFloatingDialogStack();

  const {
    data: station,
    error: stationError,
    isFetching: isFetchingStation,
    refetch: refetchStation,
  } = useQuery(stationRecordQueryOptions(stationId));
  const { data: location, isLoading: isLocationLoading } = useQuery(locationRecordQueryOptions(station?.locationId));
  const { data: brands } = useQuery(brandsQueryOptions());
  const { data: operators } = useQuery(operatorsQueryOptions());

  const userRole = session?.user?.role;
  const isAdmin = userRole === "admin" || userRole === "editor";

  const {
    data: photos,
    isError: isPhotosError,
    isFetching: isFetchingPhotos,
    refetch: refetchPhotos,
  } = useQuery({ ...stationPhotoRecordsQueryOptions(stationId), enabled: !!settings?.features.photoUploads });

  if (!station) {
    if (stationError instanceof ApiResponseError && stationError.status === 404) return <StationNotFound />;
    return stationError ? <StationRouteError /> : null;
  }

  const operatorName = station.operator?.name ?? t("main:unknownOperator");
  const operatorColor = getBrandColor(getOperatorBrand(station.operator, brands));
  const stationNotes = station.notes?.trim();
  const pageTitle = `${operatorName} ${station.siteId}`;
  const city = station.location?.city || tCommon("labels.unknownLocation");
  const hostStation = findHostStation(station, location?.stations);

  return (
    <main className="w-full px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <h1 className="sr-only">{`${t("dialog.btsStation")} ${pageTitle} - ${city}`}</h1>

      <header className="overflow-hidden rounded-2xl border border-border/70 bg-background">
        <div
          className="relative flex items-start gap-3 px-4 py-4 sm:px-6 sm:py-5"
          style={{ backgroundImage: getOperatorHeaderTintGradient(operatorColor) }}
        >
          <div className="flex-1 min-w-0">
            <div className="min-w-0 space-y-1.5">
              <StationPanelHeading
                station={station}
                brands={brands}
                operators={operators}
                locationStations={location?.stations}
                isLocationLoading={isLocationLoading}
                onOpenStation={(stationId) => openStationDialog(stationId, "internal")}
              />
              <StationDialogActionBar>
                <button
                  id={getStationHistoryTriggerId(station.id)}
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() =>
                    openStationHistoryDialog({
                      stationId: station.id,
                      stationCode: station.siteId,
                      operatorName,
                      operatorBrandId: station.operator?.brandId ?? null,
                    })
                  }
                  className={`${stationDialogInlineActionClassName} w-auto px-1.5`}
                >
                  <HugeiconsIcon icon={Clock01Icon} className="size-3.5" />
                  <span className="whitespace-nowrap text-xs font-medium leading-none">{t("history.action")}</span>
                </button>
                {session?.user ? (
                  <>
                    <AddToListPopover
                      stationId={station.id}
                      size="md"
                      className={stationDialogInlineActionClassName}
                      showLabel
                      labelClassName={stationDialogInlineActionLabelClassName}
                      showTooltip={false}
                    />
                    <WatchButton
                      stationId={station.id}
                      className={stationDialogInlineActionClassName}
                      labelClassName={stationDialogInlineActionLabelClassName}
                    />
                  </>
                ) : null}
              </StationDialogActionBar>
            </div>
          </div>
          <div className="absolute top-3 right-3 flex shrink-0 items-center gap-0.5 sm:static sm:-mt-1 sm:-mr-2">
            <ShareButton
              title={`${station.siteId} (${operatorName})`}
              text={`${station.siteId} (${operatorName}) - ${city} ${station.location?.address || ""}`.trim()}
              url={`${window.location.origin}/stations/${station.id}`}
              size="md"
              className={stationDialogHeaderIconActionClassName}
            />
            {isAdmin ? (
              <Link
                to="/admin/stations/$id"
                params={{ id: String(station.id) }}
                search={{ uke: undefined }}
                className="ml-1 mr-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
              >
                <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{t("common:actions.edit")}</span>
              </Link>
            ) : (
              settings?.features.submissions && (
                <Link
                  to="/submission"
                  search={{ station: String(station.id) }}
                  className="ml-1.5 inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">{t("common:actions.edit")}</span>
                </Link>
              )
            )}
          </div>
        </div>
        {stationNotes ? (
          <div className="border-t border-primary/20 bg-primary/8 px-4 py-3 text-primary sm:px-6">
            <div className="flex items-start gap-2.5">
              <HugeiconsIcon icon={Note01Icon} className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold">{t("specs.internalNotes")}</p>
                <p className="whitespace-pre-wrap wrap-break-word pr-1 text-xs leading-relaxed text-foreground">{stationNotes}</p>
              </div>
            </div>
          </div>
        ) : null}
        {station.status === "inactive" ? (
          <div className="border-t border-red-600/30 bg-red-500/10 px-4 py-3 text-red-700 dark:border-red-400/35 dark:bg-red-400/12 dark:text-red-300 sm:px-6">
            <div className="flex items-start gap-2.5">
              <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">{t("dialog.inactiveStationTitle")}</p>
                <p className="text-xs text-red-700/85 dark:text-red-300/80">{t("dialog.inactiveStationDescription")}</p>
              </div>
            </div>
          </div>
        ) : null}
        {photos !== undefined && photos.length > 0 ? (
          <div className="border-t px-4 py-3 sm:px-6">
            <PhotoStrip photos={listShownPhotos(photos, stationId)} />
          </div>
        ) : null}
        {isPhotosError && photos === undefined ? (
          <div className="border-t px-4 py-3 sm:px-6">
            <InlineError title={tCommon("photos.loadError")} onRetry={() => refetchPhotos()} isRetrying={isFetchingPhotos} />
          </div>
        ) : null}
      </header>

      <div className="mt-4 grid gap-4 sm:mt-6 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-start">
        <aside className="min-w-0 space-y-5 sm:space-y-6 lg:col-start-2">
          <CollapsibleSection title={t("page.info")}>
            <div className="@container space-y-4">
              <StationOverviewGrid station={station} />
              {station.location !== null ? (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
                  <Link to="/" hash={getStationMapHash(station.id, station.location)} className={entityPageChipClassName}>
                    <HugeiconsIcon icon={MapsLocation01Icon} className="size-3.5" />
                    {tCommon("actions.showOnMap")}
                  </Link>
                  <Link to="/locations/$id" params={{ id: String(station.location.id) }} className={entityPageChipClassName}>
                    <HugeiconsIcon icon={Location01Icon} className="size-3.5" />
                    {t("page.stationsAtLocation")}
                  </Link>
                  {preferences.navLinksDisplay === "buttons" && preferences.navigationApps.length > 0 ? (
                    <NavigationLinks latitude={station.location.latitude} longitude={station.location.longitude} displayMode="buttons" />
                  ) : null}
                </div>
              ) : null}
            </div>
          </CollapsibleSection>

          {station.sectors.length > 0 ? (
            <CollapsibleSection title={t("tabs.sectors")}>
              <div className="flex flex-col items-center gap-4 py-2">
                <StationSectorsCompass sectors={station.sectors} color={operatorColor} />
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {station.sectors.map((sector, index) => (
                    <span key={sector.id} className="text-xs font-medium text-muted-foreground tabular-nums">
                      A{index + 1}: {formatSectorAzimuth(sector.azimuth, t)}
                    </span>
                  ))}
                </div>
              </div>
            </CollapsibleSection>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-5 sm:space-y-6 lg:col-start-1 lg:row-start-1">
          <CollapsibleSection title={t("specs.cellDetails")}>
            {stationError !== null ? (
              <div className="mb-3">
                <StaleDataNotice onRetry={() => refetchStation()} isRetrying={isFetchingStation} />
              </div>
            ) : null}
            <StationCellTables station={station} showHeading={false} />
          </CollapsibleSection>

          <CollapsibleSection title={t("tabs.permits")}>
            <PermitsList
              stationId={stationId}
              permitHolderNote={
                hostStation !== null ? (
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm">
                    <span>{t("permits.permitHolder")}</span>
                    <HostStationLink
                      station={hostStation}
                      brand={getOperatorBrand(hostStation.operator, brands)}
                      onOpen={(stationId) => openStationDialog(stationId, "internal")}
                    />
                  </div>
                ) : null
              }
            />
          </CollapsibleSection>

          {settings?.features.comments ? (
            <CollapsibleSection title={t("comments.title")}>
              <CommentsList stationId={stationId} canModerate={isAdmin} showAddForm />
            </CollapsibleSection>
          ) : null}
        </div>
      </div>
    </main>
  );
}

export const Route = createFileRoute("/_layout/stations_/$id")({
  codeSplitGroupings: [["loader"], ["component"], ["errorComponent"], ["notFoundComponent"]],
  component: StationPage,
  loader: async ({ params }) => {
    const id = parseSEOEntityId(params.id);
    if (id === null) throw notFound();
    void queryClient
      .query(settingsQueryOptions())
      .then((settings) => (settings?.features.photoUploads ? queryClient.query(stationPhotoRecordsQueryOptions(id)) : undefined))
      .catch(() => undefined);
    try {
      return await queryClient.query({ ...stationRecordQueryOptions(id), staleTime: "static" });
    } catch (error) {
      if (error instanceof ApiResponseError && error.status === 404) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => (loaderData ? stationHead(loaderData) : { meta: [{ name: "robots", content: "noindex" }] }),
  notFoundComponent: StationNotFound,
  errorComponent: StationRouteError,
});
