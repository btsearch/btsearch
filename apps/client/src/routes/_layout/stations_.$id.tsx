import {
  Alert02Icon,
  Clock01Icon,
  Location01Icon,
  MapsLocation01Icon,
  Note01Icon,
  PencilEdit02Icon,
  SearchRemoveIcon,
  SignalFull02Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createStationSEOMetadata, parseSEOEntityId } from "@openbts/shared/seo";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { CollapsibleSection } from "@/components/content/collapsibleSection";
import { EntityNotFound, EntityRouteError, entityPageChipClassName } from "@/components/content/entityPage";
import { PhotoStrip } from "@/components/photos/photoStrip";
import { InlineError } from "@/components/ui/error-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { getStationHistoryTriggerId } from "@/features/floating-dialogs/types";
import { AddToListPopover } from "@/features/lists/components/addToListPopover";
import { RAT_ORDER } from "@/features/shared/rat";
import { fetchStationPhotos } from "@/features/station-details/api";
import { CellTable } from "@/features/station-details/components/cellTable";
import { CommentsList } from "@/features/station-details/components/commentsList";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import { NavigationLinks } from "@/features/station-details/components/navLinks";
import { PermitsList } from "@/features/station-details/components/permitsList";
import { SectorMiniCompass } from "@/features/station-details/components/sectorMiniCompass";
import { ShareButton } from "@/features/station-details/components/shareButton";
import {
  StationDialogActionBar,
  stationDialogInlineActionClassName,
  stationDialogInlineActionLabelClassName,
} from "@/features/station-details/components/stationDialogActionBar";
import { stationDialogHeaderIconActionClassName } from "@/features/station-details/components/stationDialogHeaderStyles";
import { StationInfoGrid } from "@/features/station-details/components/stationInfoCard";
import { VirtualStationBadge } from "@/features/station-details/components/virtualStationBadge";
import { WatchButton } from "@/features/station-details/components/watchButton";
import { stationQueryOptions } from "@/features/station-details/queries";
import { groupCellsByRat } from "@/features/station-details/utils";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { APP_NAME, ApiResponseError } from "@/lib/api";
import { authClient } from "@/lib/auth/client";
import { getOperatorColor, getOperatorHeaderTintGradient } from "@/lib/cellular/operators";
import { formatFullDate, formatRelativeTime } from "@/lib/format";
import { queryClient } from "@/lib/queryClient";
import { buildPageHead, getBrowserOrigin } from "@/lib/seo";
import type { Station } from "@/types/station";

function stationHead(station: Station) {
  return buildPageHead(
    createStationSEOMetadata(
      { name: APP_NAME, url: getBrowserOrigin() },
      {
        id: station.id,
        stationCode: station.station_id,
        status: station.status,
        operatorName: station.operator.name,
        operatorMnc: station.operator.mnc,
        networksId: station.extra_identificators?.networks_id,
        city: station.location.city,
        address: station.extra_address || station.location.address,
        regionName: station.location.region?.name,
        latitude: station.location.latitude,
        longitude: station.location.longitude,
        bands: station.cells.map((cell) => ({ rat: cell.rat, value: cell.band.value })),
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

function StationPage() {
  const { id } = Route.useParams();
  const stationId = Number(id);
  const { t, i18n } = useTranslation(["stationDetails", "common", "stations", "nav"]);
  const { t: tCommon } = useTranslation("common");
  const { data: settings } = useSettings();
  const { data: session } = authClient.useSession();
  const { preferences } = usePreferences();
  const { openStationDialog, openStationHistoryDialog } = useFloatingDialogStack();

  const { data: station, error: stationError } = useQuery(stationQueryOptions(stationId));

  const userRole = session?.user?.role as string | undefined;
  const isAdmin = userRole === "admin" || userRole === "editor";

  const {
    data: photos,
    isError: isPhotosError,
    isFetching: isFetchingPhotos,
    refetch: refetchPhotos,
  } = useQuery({
    queryKey: ["station-photos", stationId],
    queryFn: () => fetchStationPhotos(stationId),
    staleTime: 1000 * 60 * 5,
    enabled: !!settings?.photosEnabled,
  });

  const cellGroups = useMemo(() => groupCellsByRat(station?.cells ?? []), [station?.cells]);
  const sectorInfoById = useMemo(
    () => new Map((station?.sectors ?? []).map((sector, index) => [sector.id, { label: `A${index + 1}`, azimuth: sector.azimuth }])),
    [station?.sectors],
  );

  if (!station) {
    if (stationError instanceof ApiResponseError && stationError.status === 404) return <StationNotFound />;
    return stationError ? <StationRouteError /> : null;
  }

  const operatorColor = getOperatorColor(station.operator.mnc);
  const stationNotes = station.notes?.trim();
  const pageTitle = `${station.operator.name} ${station.station_id}`;
  const city = station.location.city || tCommon("labels.unknownLocation");
  const mapHash = `map=16/${station.location.latitude}/${station.location.longitude}~f~S${station.id}`;

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
              <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 pr-28 sm:pr-0">
                <DialogOperatorName name={station.operator.name} mnc={station.operator.mnc} labelClassName="text-lg leading-6 sm:text-xl" />
                <span className="shrink-0 font-mono text-sm font-medium text-muted-foreground">{station.station_id}</span>
                <VirtualStationBadge station={station} onOpenStation={(id) => openStationDialog(id, "internal")} />
                {station.is_confirmed ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <HugeiconsIcon icon={Tick02Icon} className="size-3.5" aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">{t("common:labels.confirmed")}</span>
                  </span>
                ) : null}
                {station.status ? <StationStatusBadge status={station.status} statusChangedAt={station.statusChangedAt} /> : null}
              </div>
              <p className="text-sm leading-5 text-muted-foreground">
                <span className="font-semibold text-foreground">{city}</span>
                {station.extra_address || station.location.address ? <span> · {station.extra_address || station.location.address}</span> : null}
              </p>
              <div className="flex flex-col items-start pt-0.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
                <Tooltip>
                  <TooltipTrigger className="cursor-default whitespace-nowrap text-[11px] text-muted-foreground/80">
                    {tCommon("labels.created")}: {formatRelativeTime(station.createdAt, tCommon)}
                  </TooltipTrigger>
                  <TooltipContent>{formatFullDate(station.createdAt, i18n.language)}</TooltipContent>
                </Tooltip>
                <span className="hidden text-[11px] text-muted-foreground/40 sm:inline">·</span>
                <time
                  dateTime={station.updatedAt}
                  title={formatFullDate(station.updatedAt, i18n.language)}
                  className="whitespace-nowrap text-[11px] text-muted-foreground/80"
                >
                  {tCommon("labels.updated")}: {formatRelativeTime(station.updatedAt, tCommon)}
                </time>
              </div>
              <StationDialogActionBar>
                <button
                  id={getStationHistoryTriggerId(station.id)}
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() =>
                    openStationHistoryDialog({
                      stationId: station.id,
                      stationCode: station.station_id,
                      operatorName: station.operator.name,
                      operatorMnc: station.operator.mnc,
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
                      size="md"
                      className={stationDialogInlineActionClassName}
                      showLabel
                      labelClassName={stationDialogInlineActionLabelClassName}
                      showTooltip={false}
                    />
                  </>
                ) : null}
              </StationDialogActionBar>
            </div>
          </div>
          <div className="absolute top-3 right-3 flex shrink-0 items-center gap-0.5 sm:static sm:-mt-1 sm:-mr-2">
            <ShareButton
              title={`${station.station_id} (${station.operator.name})`}
              text={`${station.station_id} (${station.operator.name}) - ${city} ${station.location.address || ""}`.trim()}
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
              settings?.submissionsEnabled && (
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
            <PhotoStrip photos={photos} />
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
              <StationInfoGrid
                stationCode={station.station_id}
                operator={station.operator}
                location={station.location}
                showPemReports={!station.physicalStation}
                uplink={station.uplink}
                extraIdentificators={station.extra_identificators}
              />
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-3">
                <Link to="/" hash={mapHash} className={entityPageChipClassName}>
                  <HugeiconsIcon icon={MapsLocation01Icon} className="size-3.5" />
                  {tCommon("actions.showOnMap")}
                </Link>
                <Link to="/locations/$id" params={{ id: String(station.location.id) }} className={entityPageChipClassName}>
                  <HugeiconsIcon icon={Location01Icon} className="size-3.5" />
                  {t("page.stationsAtLocation")}
                </Link>
                {preferences.navLinksDisplay === "buttons" && preferences.navigationApps.length > 0 && (
                  <NavigationLinks latitude={station.location.latitude} longitude={station.location.longitude} displayMode="buttons" />
                )}
              </div>
            </div>
          </CollapsibleSection>

          {(station.sectors?.length ?? 0) > 0 ? (
            <CollapsibleSection title={t("tabs.sectors")}>
              <div className="flex flex-col items-center gap-4 py-2">
                <SectorMiniCompass sectors={station.sectors ?? []} />
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {(station.sectors ?? []).map((sector, index) => (
                    <span key={sector.id} className="text-xs font-medium text-muted-foreground tabular-nums">
                      A{index + 1}: {sector.azimuth}°
                    </span>
                  ))}
                </div>
              </div>
            </CollapsibleSection>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-5 sm:space-y-6 lg:col-start-1 lg:row-start-1">
          <CollapsibleSection title={t("specs.cellDetails")}>
            {Object.keys(cellGroups).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                <HugeiconsIcon icon={SignalFull02Icon} className="size-8 mb-2 opacity-20" />
                <p className="text-sm">{t("stations:cells.noStationCells")}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {RAT_ORDER.filter((rat) => cellGroups[rat]).map((rat) => (
                  <CellTable key={rat} rat={rat} cells={cellGroups[rat]} sectorInfoById={sectorInfoById} />
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection title={t("tabs.permits")}>
            <PermitsList stationId={stationId} physicalStation={station.physicalStation} />
          </CollapsibleSection>

          {settings?.enableStationComments ? (
            <CollapsibleSection title={t("comments.title")}>
              <CommentsList stationId={stationId} isAdmin={isAdmin} showAddForm />
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
    try {
      return await queryClient.query({ ...stationQueryOptions(id), staleTime: "static" });
    } catch (error) {
      if (error instanceof ApiResponseError && error.status === 404) throw notFound();
      throw error;
    }
  },
  head: ({ loaderData }) => (loaderData ? stationHead(loaderData) : { meta: [{ name: "robots", content: "noindex" }] }),
  notFoundComponent: StationNotFound,
  errorComponent: StationRouteError,
});
