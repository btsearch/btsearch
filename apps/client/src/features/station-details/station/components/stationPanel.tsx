import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

import {
  StationDialogHeadingSkeleton,
  StationDialogShell,
  StationDialogToolbarSkeleton,
  StationSourceSwitch,
} from "../../components/stationDialogShell";
import { stationPermitsQueryOptions, ukeStationQueryOptions } from "../../queries";
import type { TabId } from "../../tabs";
import { groupPermitsByUkeStation } from "../../utils";
import { useStationEditTarget } from "../access";
import { locationRecordQueryOptions, seedStationRecord, stationRecordQueryOptions } from "../api";
import { getOperatorBrand } from "../utils/brands";
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
import { brandsQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import type { TerrainProfileStationTarget } from "@/features/terrain-profile/types";
import { useSettledSession } from "@/hooks/useSettledSession";
import type { UkePermit } from "@/types/station";

type StationPanelProps = FloatingDialogPanelFrameProps & {
  stationId: number;
  locationId?: number;
  switchedFrom?: StationDialogTarget;
  showPhotoPanel?: boolean;
  onContentLayoutChange?: () => void;
  onSwitchStation?: (target: StationDialogTarget) => void;
  onStartTerrainProfile?: (station: TerrainProfileStationTarget) => void;
};

function selectFirstUkeStation(permits: UkePermit[]) {
  return groupPermitsByUkeStation(permits).at(0);
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
  const { data: linkedUkeStation } = useQuery({
    ...stationPermitsQueryOptions(stationId),
    select: selectFirstUkeStation,
    enabled: onSwitchStation !== undefined,
  });
  const editTarget = useStationEditTarget(station);
  useStationWatchPreload(stationId);

  const tintOperator = station?.operator ?? location?.stations.find((listed) => listed.id === stationId)?.operator;
  const previousUkeTarget = switchedFrom?.source === "uke" ? switchedFrom : undefined;
  const ukeTarget: StationDialogTarget | undefined = linkedUkeStation
    ? { source: "uke", id: linkedUkeStation.id, ukeStation: linkedUkeStation }
    : previousUkeTarget;
  const sourceSwitch =
    onSwitchStation && ukeTarget ? (
      <StationSourceSwitch
        source="internal"
        onSwitch={() => onSwitchStation(ukeTarget)}
        onPrefetch={() => void queryClient.prefetchQuery(ukeStationQueryOptions(ukeTarget.id))}
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
      enterFrom={previousUkeTarget ? "left" : undefined}
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
