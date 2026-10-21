import type { OfficialPermit } from "@openbts/shared/contract";
import { OFFICIAL_SITE_INCLUDES } from "@openbts/shared/contract/constants";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import {
  StationDialogHeadingSkeleton,
  StationDialogShell,
  StationDialogToolbarSkeleton,
  StationSourceSwitch,
} from "../../components/stationDialogShell";
import { stationPermitsQueryOptions } from "../../queries";
import type { TabId } from "../../tabs";
import { useStationEditTarget } from "../access";
import { locationRecordQueryOptions, seedStationRecord, stationRecordQueryOptions } from "../api";
import { getOperatorBrand } from "../utils/brands";
import { getStationCountryCode } from "../utils/stations";
import { fetchIsStationWatched, stationWatchKeys } from "../watch/api";
import { StationPanelActions } from "./panel/stationPanelActions";
import { StationPanelBanners } from "./panel/stationPanelBanners";
import { StationPanelBody } from "./panel/stationPanelBody";
import { StationPanelHeading } from "./panel/stationPanelHeading";
import { StationPanelToolbar } from "./panel/stationPanelToolbar";
import { StationSiblingStrip } from "./panel/stationSiblingStrip";
import { StationPhotoPane } from "./photos/stationPhotoPane";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import type { FloatingDialogPanelFrameProps, StationDialogTarget } from "@/features/floating-dialogs/types";
import { officialSiteQueryOptions, useOfficialSource } from "@/features/official/queries";
import { hasOfficialData } from "@/features/official/sources";
import { brandsQueryOptions, countriesQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import type { TerrainProfileStationTarget } from "@/features/terrain-profile/types";
import { useSettledSession } from "@/hooks/useSettledSession";

type StationPanelProps = FloatingDialogPanelFrameProps & {
  stationId: number;
  locationId?: number;
  switchedFrom?: StationDialogTarget;
  showPhotoPanel?: boolean;
  onContentLayoutChange?: () => void;
  onSwitchStation?: (target: StationDialogTarget) => void;
  onStartTerrainProfile?: (station: TerrainProfileStationTarget) => void;
};

function selectFirstPermitSite(permits: OfficialPermit[]) {
  return permits.at(0)?.officialSite;
}

function useStationWatchPreload(stationId: number) {
  const { data: session } = useSettledSession();

  useQuery({
    queryKey: stationWatchKeys.status(stationId),
    queryFn: ({ signal }) => fetchIsStationWatched(stationId, signal),
    enabled: Boolean(session?.user),
    notifyOnChangeProps: [],
  });
}

export function StationPanel({
  stationId,
  locationId,
  switchedFrom,
  showPhotoPanel = true,
  onClose,
  onContentLayoutChange,
  onSwitchStation,
  onStartTerrainProfile,
  ...frameProps
}: StationPanelProps) {
  const [activeTab, setActiveTab] = useState<TabId>("specs");
  const queryClient = useQueryClient();
  const { openStationDialog } = useFloatingDialogStack();

  const { data: station, isLoading, isFetching, error, refetch } = useQuery(stationRecordQueryOptions(stationId));
  const { data: location, isLoading: isLocationLoading } = useQuery({
    ...locationRecordQueryOptions(station === undefined ? locationId : station.locationId),
    placeholderData: keepPreviousData,
  });
  const { data: brands } = useQuery(brandsQueryOptions());
  const { data: operators } = useQuery(operatorsQueryOptions());
  const { data: countries } = useQuery(countriesQueryOptions());
  const isOfficialCountry = station !== undefined && hasOfficialData(countries, getStationCountryCode(station));
  const { data: linkedSite } = useQuery({
    ...stationPermitsQueryOptions(isOfficialCountry ? stationId : undefined),
    select: selectFirstPermitSite,
    enabled: onSwitchStation !== undefined,
  });
  const editTarget = useStationEditTarget(station);
  useStationWatchPreload(stationId);
  const previousOfficialTarget = switchedFrom?.source === "official" ? switchedFrom : undefined;
  const officialSite = linkedSite ?? previousOfficialTarget?.officialSite;
  const officialSource = useOfficialSource(officialSite?.sourceKey);

  const tintOperator = station?.operator ?? location?.stations.find((listed) => listed.id === stationId)?.operator;
  const officialTarget: StationDialogTarget | undefined = linkedSite
    ? { source: "official", id: linkedSite.id, officialSite: linkedSite }
    : previousOfficialTarget;
  const sourceSwitch =
    onSwitchStation && officialTarget && officialSource ? (
      <StationSourceSwitch
        source="internal"
        officialLabel={officialSource.shortName}
        onSwitch={() => onSwitchStation(officialTarget)}
        onPrefetch={() => void queryClient.prefetchQuery(officialSiteQueryOptions(officialTarget.id, OFFICIAL_SITE_INCLUDES))}
      />
    ) : null;

  const openStation = (id: number) => openStationDialog(id, "internal");
  const seedSibling = (id: number) => {
    if (location !== undefined) seedStationRecord(queryClient, location.id, id);
  };
  const selectSibling = (id: number) => {
    seedSibling(id);
    if (onSwitchStation) onSwitchStation({ source: "internal", id });
    else openStation(id);
  };
  const prefetchSibling = (id: number) => {
    seedSibling(id);
    void queryClient.prefetchQuery(stationRecordQueryOptions(id));
  };

  let heading: ReactNode = null;
  let toolbar: ReactNode = null;
  if (station) {
    heading = (
      <StationPanelHeading
        station={station}
        brands={brands}
        operators={operators}
        locationStations={location?.stations}
        isLocationLoading={isLocationLoading}
        onOpenStation={openStation}
      />
    );
    toolbar = <StationPanelToolbar key={station.id} station={station} onStartTerrainProfile={onStartTerrainProfile} onClose={onClose} />;
  } else if (isLoading) {
    heading = <StationDialogHeadingSkeleton />;
    toolbar = <StationDialogToolbarSkeleton />;
  }

  return (
    <StationDialogShell
      {...frameProps}
      onClose={onClose}
      operatorBrand={getOperatorBrand(tintOperator, brands)}
      sourceSwitch={sourceSwitch}
      enterFrom={previousOfficialTarget ? "left" : undefined}
      heading={heading}
      toolbar={toolbar}
      actions={station ? <StationPanelActions key={station.id} station={station} editTarget={editTarget} onClose={onClose} /> : null}
      banners={station ? <StationPanelBanners station={station} /> : null}
      strip={
        <StationSiblingStrip
          stationId={stationId}
          location={location}
          brands={brands}
          onSelect={selectSibling}
          onPrefetch={prefetchSibling}
          onContentLayoutChange={onContentLayoutChange}
        />
      }
      aside={showPhotoPanel ? <StationPhotoPane stationId={stationId} onOpenPhotos={() => setActiveTab("photos")} /> : null}
      bodyKey={stationId}
    >
      <StationPanelBody
        stationId={stationId}
        station={station}
        isLoading={isLoading}
        error={error}
        onRetry={() => refetch()}
        isRetrying={isFetching}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onClose={onClose}
        canEditStation={editTarget === "editor"}
        onContentLayoutChange={onContentLayoutChange}
      />
    </StationDialogShell>
  );
}
