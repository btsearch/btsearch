import { useEffect } from "react";

import type { MapFilters } from "../data/mapFilters";
import type { MapLookups } from "../data/mapLookups";
import { keepFocusedMarkers } from "./coverage/coverageFocus";
import { hideMeasuredCoverage, useFocusedCoverageTarget, useIsMeasuredCoverageShown } from "./coverage/coverageStore";
import { MeasuredCoverageLayer } from "./coverage/measuredCoverageLayer";
import { EstimatedSitesLayer } from "./sites/estimatedSitesLayer";
import { TrailsLayer } from "./trails/trailsLayer";
import type { MapCrowd } from "./useMapCrowd";

type CrowdLayersProps = {
  crowd: MapCrowd;
  filters: MapFilters;
  lookups: MapLookups | undefined;
  trailCountryCode: string | null;
  isPickingReceiver: boolean;
  onOpenStation: (stationId: number) => void;
};

export function CrowdLayers({ crowd, filters, lookups, trailCountryCode, isPickingReceiver, onOpenStation }: CrowdLayersProps) {
  const { access, theme, sharedSiteId, setSharedSiteId } = crowd;
  const isCoverageShown = useIsMeasuredCoverageShown() && access.isAvailable;
  const focusedCoverageTarget = useFocusedCoverageTarget();
  const areTrailsShown = filters.showTrails && access.isAvailable && !crowd.state.isTrailsBlocked && !isCoverageShown;

  useEffect(() => {
    if (filters.showTrails) hideMeasuredCoverage();
  }, [filters.showTrails]);

  useEffect(() => {
    if (sharedSiteId !== null && access.isSwitchedOff) setSharedSiteId(null);
  }, [sharedSiteId, access.isSwitchedOff, setSharedSiteId]);

  return (
    <>
      {access.isAvailable && (filters.showEstimatedSites || sharedSiteId !== null) ? (
        <EstimatedSitesLayer
          markers={keepFocusedMarkers(crowd.markers, focusedCoverageTarget)}
          access={access}
          lookups={lookups}
          theme={theme}
          isPickingReceiver={isPickingReceiver}
          sharedSiteId={sharedSiteId}
          onSharedSiteHandled={() => setSharedSiteId(null)}
          onOpenStation={onOpenStation}
        />
      ) : null}
      <TrailsLayer isShown={areTrailsShown} filters={filters} lookups={lookups} countryCode={trailCountryCode} access={access} theme={theme} />
      <MeasuredCoverageLayer access={access} lookups={lookups} theme={theme} isPickingReceiver={isPickingReceiver} />
    </>
  );
}
