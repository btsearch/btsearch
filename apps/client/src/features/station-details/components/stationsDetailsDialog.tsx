import { Add01Icon, Alert02Icon, Clock01Icon, Note01Icon, PencilEdit02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { stationPermitsQueryOptions, stationQueryOptions, ukeStationQueryOptions } from "../queries";
import type { TabId } from "../tabs";
import { groupPermitsByUkeStation } from "../utils";
import { StationDetailsBody, StationDetailsError } from "./dialogBody";
import { MainPhotoPanel } from "./mainPhotoPanel";
import { PermitsList } from "./permitsList";
import { ShareButton } from "./shareButton";
import { stationDialogInlineActionClassName, stationDialogInlineActionLabelClassName } from "./stationDialogActionBar";
import { stationDialogHeaderIconActionClassName, stationDialogPrimaryActionClassName } from "./stationDialogHeaderStyles";
import {
  StationDialogHeading,
  StationDialogHeadingSkeleton,
  StationDialogShell,
  StationDialogToolbarSkeleton,
  StationSourceSwitch,
} from "./stationDialogShell";
import { StationInfoCard } from "./stationInfoCard";
import { UKELogo } from "./ukeLogo";
import { VirtualStationBadge } from "./virtualStationBadge";
import { WatchButton } from "./watchButton";
import { InlineError, StaleDataNotice } from "@/components/ui/error-state";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { getStationHistoryTriggerId } from "@/features/floating-dialogs/types";
import type { FloatingDialogPanelFrameProps, StationDialogTarget } from "@/features/floating-dialogs/types";
import { AddToListPopover } from "@/features/lists/components/addToListPopover";
import { StationStatusBadge } from "@/features/stations/components/StationStatusBadge";
import { TerrainProfileAnalyzeButton } from "@/features/terrain-profile/components/terrainProfileAnalyzeButton";
import type { TerrainProfileStationTarget } from "@/features/terrain-profile/types";
import { usePreferences } from "@/hooks/usePreferences";
import { useSettings } from "@/hooks/useSettings";
import { authClient } from "@/lib/auth/client";
import { cn } from "@/lib/utils";
import type { StationSource, UkePermit, UkeStation } from "@/types/station";

type StationDialogPanelProps = FloatingDialogPanelFrameProps & {
  stationId: number;
  switchedFrom?: StationDialogTarget;
  onSwitchStation?: (target: StationDialogTarget) => void;
  onStartTerrainProfile?: (station: TerrainProfileStationTarget) => void;
};

type StationDetailsDialogPanelProps = StationDialogPanelProps & {
  source: StationSource;
  ukeStation?: UkeStation;
  showPhotoPanel?: boolean;
  onContentLayoutChange?: () => void;
};

export function StationDetailsDialogPanel({
  source,
  ukeStation,
  showPhotoPanel,
  onContentLayoutChange,
  ...panelProps
}: StationDetailsDialogPanelProps) {
  if (source === "uke") return <UkeStationDialogPanel placeholder={ukeStation} {...panelProps} />;
  return <InternalStationDialogPanel showPhotoPanel={showPhotoPanel} onContentLayoutChange={onContentLayoutChange} {...panelProps} />;
}

function selectFirstUkeStation(permits: UkePermit[]) {
  return groupPermitsByUkeStation(permits).at(0);
}

type InternalStationDialogPanelProps = StationDialogPanelProps & {
  showPhotoPanel?: boolean;
  onContentLayoutChange?: () => void;
};

function InternalStationDialogPanel({
  stationId,
  switchedFrom,
  showPhotoPanel = true,
  onClose,
  onContentLayoutChange,
  onSwitchStation,
  onStartTerrainProfile,
  ...frameProps
}: InternalStationDialogPanelProps) {
  const { t } = useTranslation(["stationDetails", "common"]);
  const [activeTab, setActiveTab] = useState<TabId>("specs");
  const queryClient = useQueryClient();
  const { openStationDialog, openStationHistoryDialog } = useFloatingDialogStack();
  const { data: settings } = useSettings();
  const { data: session } = authClient.useSession();
  const userRole = session?.user?.role as string | undefined;
  const isAdmin = userRole === "admin" || userRole === "editor";
  const { preferences } = usePreferences();

  const { data: station, isLoading, isFetching, error, refetch } = useQuery(stationQueryOptions(stationId));
  const { data: linkedUkeStation } = useQuery({
    ...stationPermitsQueryOptions(stationId),
    select: selectFirstUkeStation,
    enabled: onSwitchStation !== undefined,
  });

  const ukeTarget: StationDialogTarget | undefined = linkedUkeStation
    ? { source: "uke", id: linkedUkeStation.id, ukeStation: linkedUkeStation }
    : switchedFrom;
  const sourceSwitch =
    onSwitchStation && ukeTarget ? (
      <StationSourceSwitch
        source="internal"
        onSwitch={() => onSwitchStation(ukeTarget)}
        onPrefetch={() => void queryClient.prefetchQuery(ukeStationQueryOptions(ukeTarget.id))}
      />
    ) : null;
  const stationNotes = station?.notes?.trim();
  const stationCity = station?.location.city || t("common:labels.unknownLocation");
  const stationAddress = station?.extra_address || station?.location.address;

  return (
    <StationDialogShell
      {...frameProps}
      onClose={onClose}
      operatorMnc={station?.operator.mnc}
      sourceSwitch={sourceSwitch}
      enterFrom={switchedFrom ? "left" : undefined}
      heading={
        isLoading ? (
          <StationDialogHeadingSkeleton />
        ) : station ? (
          <StationDialogHeading
            operatorName={station.operator.name}
            operatorMnc={station.operator.mnc}
            stationCode={station.station_id}
            badges={
              <>
                <VirtualStationBadge station={station} onOpenStation={(id) => openStationDialog(id, "internal")} />
                {station.is_confirmed ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
                    <span className="hidden sm:inline">{t("common:labels.confirmed")}</span>
                  </span>
                ) : null}
              </>
            }
            location={{ city: station.location.city, address: stationAddress || null }}
            status={station.status ? <StationStatusBadge status={station.status} statusChangedAt={station.statusChangedAt} /> : null}
            createdAt={station.createdAt}
            updatedAt={station.updatedAt}
          />
        ) : null
      }
      toolbar={
        isLoading ? (
          <StationDialogToolbarSkeleton />
        ) : station ? (
          <>
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
              className={cn(stationDialogInlineActionClassName, "w-auto px-1.5")}
            >
              <HugeiconsIcon icon={Clock01Icon} className="size-3.5" />
              <span className="whitespace-nowrap text-xs font-medium leading-none">{t("history.action")}</span>
            </button>
            <StationDialogActions
              source="internal"
              id={station.id}
              stationCode={station.station_id}
              operatorName={station.operator.name}
              location={station.location}
              onStartTerrainProfile={onStartTerrainProfile}
              onClose={onClose}
            />
          </>
        ) : null
      }
      actions={
        station ? (
          <>
            <ShareButton
              title={`${station.station_id} (${station.operator.name})`}
              text={`${station.station_id} (${station.operator.name}) - ${stationCity}${stationAddress ? ` ${stationAddress}` : ""}`}
              url={`${window.location.origin}/stations/${station.id}`}
              size="md"
              className={stationDialogHeaderIconActionClassName}
            />
            {isAdmin ? (
              <Link
                to="/admin/stations/$id"
                params={{ id: String(station.id) }}
                search={{ uke: undefined }}
                className={stationDialogPrimaryActionClassName}
                onClick={onClose}
              >
                <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
                <span className="hidden sm:inline">{t("common:actions.edit")}</span>
              </Link>
            ) : settings?.submissionsEnabled ? (
              <Link to="/submission" search={{ station: String(station.id) }} className={stationDialogPrimaryActionClassName} onClick={onClose}>
                <HugeiconsIcon icon={PencilEdit02Icon} className="size-3.5" />
                <span className="hidden sm:inline">{t("common:actions.edit")}</span>
              </Link>
            ) : null}
          </>
        ) : null
      }
      banners={
        <>
          {stationNotes ? (
            <div className="border-t border-primary/20 bg-primary/8 px-6 py-3 text-primary">
              <div className="flex items-start gap-2.5">
                <HugeiconsIcon icon={Note01Icon} className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 space-y-0.5">
                  <p className="text-sm font-semibold">{t("specs.internalNotes")}</p>
                  <p className="max-h-20 overflow-y-auto whitespace-pre-wrap wrap-break-word pr-1 text-xs leading-relaxed text-foreground custom-scrollbar">
                    {stationNotes}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
          {station?.status === "inactive" ? (
            <div className="border-t border-red-600/30 bg-red-500/10 px-6 py-3 text-red-700 dark:border-red-400/35 dark:bg-red-400/12 dark:text-red-300">
              <div className="flex items-start gap-2.5">
                <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0" />
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">{t("dialog.inactiveStationTitle")}</p>
                  <p className="text-xs text-red-700/85 dark:text-red-300/80">{t("dialog.inactiveStationDescription")}</p>
                </div>
              </div>
            </div>
          ) : null}
        </>
      }
      aside={
        showPhotoPanel && preferences.showStationPhotoPanel ? (
          <div className="absolute top-0 left-full pl-3 hidden xl:flex h-full max-h-[calc(100dvh-2rem)]">
            <MainPhotoPanel stationId={stationId} onOpenPhotoTab={() => setActiveTab("photos")} />
          </div>
        ) : null
      }
    >
      <StationDetailsBody
        stationId={stationId}
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        isRetrying={isFetching}
        station={station}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClose={onClose}
        isAdmin={isAdmin}
        onContentLayoutChange={onContentLayoutChange}
      />
    </StationDialogShell>
  );
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
          void queryClient.prefetchQuery(stationQueryOptions(internalTarget.id));
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
              operatorName={operatorName}
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
                url={`${window.location.origin}/#map=16/${location.latitude}/${location.longitude}~fu~U${station.id}`}
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
            ) : canCreateStation && isLoggedIn && settings?.submissionsEnabled ? (
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

type StationDialogActionsProps = {
  source: StationSource;
  id: number;
  stationCode: string;
  operatorName: string;
  location: { latitude: number; longitude: number };
  onStartTerrainProfile?: (station: TerrainProfileStationTarget) => void;
  onClose: () => void;
};

function StationDialogActions({ source, id, stationCode, operatorName, location, onStartTerrainProfile, onClose }: StationDialogActionsProps) {
  return (
    <>
      <AddToListPopover
        stationId={source === "internal" ? id : undefined}
        ukeStationId={source === "uke" ? id : undefined}
        size="md"
        className={stationDialogInlineActionClassName}
        showLabel
        labelClassName={stationDialogInlineActionLabelClassName}
        showTooltip={false}
      />
      <WatchButton
        stationId={id}
        source={source}
        size="md"
        className={stationDialogInlineActionClassName}
        showLabel
        labelClassName={stationDialogInlineActionLabelClassName}
        showTooltip={false}
      />
      {onStartTerrainProfile ? (
        <TerrainProfileAnalyzeButton
          target={{ source, id, stationId: stationCode, operatorName, latitude: location.latitude, longitude: location.longitude }}
          onStart={(target) => {
            onStartTerrainProfile(target);
            onClose();
          }}
          size="md"
          className={stationDialogInlineActionClassName}
          showLabel
          labelClassName={stationDialogInlineActionLabelClassName}
          showTooltip={false}
        />
      ) : null}
    </>
  );
}
