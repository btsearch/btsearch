import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { stationPermitsQueryOptions, ukeStationQueryOptions } from "../queries";
import { stationRecordQueryOptions } from "../station/api";
import { StationPanel } from "../station/components/stationPanel";
import { PermitsList } from "./permitsList";
import { ShareButton } from "./shareButton";
import { StationDetailsError } from "./stationDetailsError";
import { stationDialogHeaderIconActionClassName, stationDialogPrimaryActionClassName } from "./stationDialogHeaderStyles";
import {
  StationDialogActions,
  StationDialogHeading,
  StationDialogHeadingSkeleton,
  StationDialogShell,
  StationDialogToolbarSkeleton,
  StationSourceSwitch,
} from "./stationDialogShell";
import { StationInfoCard } from "./stationInfoCard";
import { UKELogo } from "./ukeLogo";
import { InlineError, StaleDataNotice } from "@/components/ui/error-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { FloatingDialogPanelFrameProps, StationDialogTarget } from "@/features/floating-dialogs/types";
import { getOfficialSiteMapHash } from "@/features/map/mapLinks";
import type { TerrainProfileStationTarget } from "@/features/terrain-profile/types";
import { useSettings } from "@/hooks/useSettings";
import { authClient } from "@/lib/auth/client";
import type { StationSource, UkeStation } from "@/types/station";

type StationDialogPanelProps = FloatingDialogPanelFrameProps & {
  stationId: number;
  switchedFrom?: StationDialogTarget;
  onSwitchStation?: (target: StationDialogTarget) => void;
  onStartTerrainProfile?: (station: TerrainProfileStationTarget) => void;
};

type StationDetailsDialogPanelProps = StationDialogPanelProps & {
  source: StationSource;
  ukeStation?: UkeStation;
  locationId?: number;
  showPhotoPanel?: boolean;
  onContentLayoutChange?: () => void;
};

export function StationDetailsDialogPanel({
  source,
  ukeStation,
  locationId,
  showPhotoPanel,
  onContentLayoutChange,
  ...panelProps
}: StationDetailsDialogPanelProps) {
  if (source === "uke") return <UkeStationDialogPanel placeholder={ukeStation} {...panelProps} />;
  return <StationPanel locationId={locationId} showPhotoPanel={showPhotoPanel} onContentLayoutChange={onContentLayoutChange} {...panelProps} />;
}

type UkeStationDialogPanelProps = StationDialogPanelProps & {
  placeholder?: UkeStation;
};

function UkeStationDialogPanel({
  stationId,
  placeholder,
  switchedFrom,
  onClose,
  onSwitchStation,
  onStartTerrainProfile,
  ...frameProps
}: UkeStationDialogPanelProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const queryClient = useQueryClient();
  const { data: settings } = useSettings();
  const { data: session } = authClient.useSession();
  const userRole = session?.user?.role as string | undefined;
  const isAdmin = userRole === "admin" || userRole === "editor";
  const isLoggedIn = !!session?.user;

  const { data, isLoading, isFetching, error, errorUpdateCount, refetch } = useQuery(ukeStationQueryOptions(stationId));

  const station = data ?? placeholder;
  const showDetailsError = !data && (error !== null || (isFetching && errorUpdateCount > 0));
  const operatorName = station?.operator?.name ?? t("main:unknownOperator");
  const location = station?.location;
  const internalStation = data?.internalStation;
  const canCreateStation = !!data && !internalStation;
  const internalTarget: StationDialogTarget | undefined = internalStation ? { source: "internal", id: internalStation.id } : switchedFrom;
  const sourceSwitch =
    onSwitchStation && internalTarget ? (
      <StationSourceSwitch
        source="uke"
        onSwitch={() => onSwitchStation(internalTarget)}
        onPrefetch={() => {
          void queryClient.prefetchQuery(stationRecordQueryOptions(internalTarget.id));
          void queryClient.prefetchQuery(stationPermitsQueryOptions(internalTarget.id));
        }}
      />
    ) : null;

  return (
    <StationDialogShell
      {...frameProps}
      onClose={onClose}
      operatorMnc={station?.operator?.mnc}
      sourceSwitch={sourceSwitch}
      enterFrom={switchedFrom ? "right" : undefined}
      heading={
        station ? (
          <StationDialogHeading
            operatorName={operatorName}
            operatorMnc={station.operator?.mnc}
            stationCode={station.station_id}
            location={location}
            createdAt={station.createdAt}
            updatedAt={station.updatedAt}
          />
        ) : isLoading ? (
          <StationDialogHeadingSkeleton />
        ) : null
      }
      toolbar={
        station ? (
          location && (isLoggedIn || onStartTerrainProfile) ? (
            <StationDialogActions
              source="uke"
              id={station.id}
              stationCode={station.station_id}
              operatorId={station.operator?.id ?? null}
              operatorName={operatorName}
              countryCode={null}
              location={location}
              onStartTerrainProfile={onStartTerrainProfile}
              onClose={onClose}
            />
          ) : null
        ) : isLoading ? (
          <StationDialogToolbarSkeleton />
        ) : null
      }
      actions={
        station ? (
          <>
            {location ? (
              <ShareButton
                title={`${station.station_id} (${operatorName})`}
                text={`UKE: ${station.station_id} (${operatorName}) - ${location.city || t("common:labels.unknownLocation")}${location.address ? ` ${location.address}` : ""}`}
                url={`${window.location.origin}/#${getOfficialSiteMapHash(station.id, location)}`}
                size="md"
                className={stationDialogHeaderIconActionClassName}
              />
            ) : null}
            {canCreateStation && isAdmin ? (
              <Link
                to="/admin/stations/$id"
                params={{ id: "new" }}
                search={{ uke: station.station_id }}
                className={stationDialogPrimaryActionClassName}
                onClick={onClose}
              >
                <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                <span className="hidden sm:inline">{t("common:actions.createStation")}</span>
              </Link>
            ) : canCreateStation && isLoggedIn && settings?.features.submissions ? (
              <Link to="/submission" search={{ uke: station.station_id }} className={stationDialogPrimaryActionClassName} onClick={onClose}>
                <HugeiconsIcon icon={Add01Icon} className="size-3.5" />
                <span className="hidden sm:inline">{t("common:actions.createStation")}</span>
              </Link>
            ) : null}
          </>
        ) : null
      }
    >
      {station ? (
        <div className="px-3 py-4 space-y-6 sm:p-6 sm:space-y-8">
          {showDetailsError ? (
            <InlineError
              title={t("dialog.detailsLoadErrorTitle")}
              description={t("dialog.detailsLoadErrorDescription")}
              onRetry={() => refetch()}
              isRetrying={isFetching}
            />
          ) : null}
          {error && data ? (
            <div className="mb-3 flex justify-center">
              <StaleDataNotice onRetry={() => refetch()} isRetrying={isFetching} />
            </div>
          ) : null}
          <StationInfoCard
            source="uke"
            stationCode={station.station_id}
            operator={{ name: operatorName, mnc: station.operator?.mnc }}
            location={location}
            emfSite={{ officialSiteId: station.id }}
            onClose={onClose}
          />
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{t("tabs.permits")}</h3>
              <Tooltip>
                <TooltipTrigger className="cursor-help opacity-60 transition-opacity hover:opacity-100">
                  <UKELogo className="h-3" />
                  <span className="sr-only">UKE</span>
                </TooltipTrigger>
                <TooltipContent>{t("permits.sourceUke")}</TooltipContent>
              </Tooltip>
            </div>
            <PermitsList permits={station.permits} />
          </section>
        </div>
      ) : isLoading ? (
        <div className="px-3 py-4 sm:p-6">
          <PermitsList permits={[]} isExternalLoading />
        </div>
      ) : error ? (
        <StationDetailsError error={error} onRetry={() => refetch()} isRetrying={isFetching} onClose={onClose} />
      ) : null}
    </StationDialogShell>
  );
}
