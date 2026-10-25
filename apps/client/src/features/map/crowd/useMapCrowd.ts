import { useMemo, useState } from "react";

import type { MapFilters } from "../data/mapFilters";
import type { MapLookups } from "../data/mapLookups";
import { readPrivateCountriesOnScreen } from "./access/countryPrivacy";
import { type CrowdAccess, useCrowdAccess } from "./access/useCrowdAccess";
import { useMeasuredCoverageHost } from "./coverage/coverageStore";
import type { EstimatedSiteMarker } from "./sites/estimatedSites";
import { type EstimatedSitesOverflow, useEstimatedSites } from "./sites/useEstimatedSites";
import type { CrowdTheme } from "./style/palette";
import { useResolvedTheme } from "@/components/ui/map";

type UseMapCrowdArgs = {
  bbox: string;
  isMoving: boolean;
  filters: MapFilters;
  lookups: MapLookups | undefined;
  countryCodesOnScreen: readonly string[];
};

export type MapCrowdState = {
  isAvailable: boolean;
  isSwitchedOff: boolean;
  isStaff: boolean;
  isTrailsBlocked: boolean;
  hidesPrivateCountries: boolean;
  estimatedSiteCount: number;
  estimatedSiteOverflow: EstimatedSitesOverflow | null;
};

export type MapCrowd = {
  access: CrowdAccess;
  theme: CrowdTheme;
  markers: readonly EstimatedSiteMarker[];
  state: MapCrowdState;
  sharedSiteId: number | null;
  setSharedSiteId: (observedSiteId: number | null) => void;
};

export function useMapCrowd({ bbox, isMoving, filters, lookups, countryCodesOnScreen }: UseMapCrowdArgs): MapCrowd {
  const theme = useResolvedTheme();
  const access = useCrowdAccess();
  const [sharedSiteId, setSharedSiteId] = useState<number | null>(null);
  useMeasuredCoverageHost(access.isAvailable);

  const { markers, overflow } = useEstimatedSites({ bbox, isMoving, filters, access, lookups, theme });
  const { hidesPrivateCountries, isTrailsBlocked } = readPrivateCountriesOnScreen(lookups?.countries, countryCodesOnScreen, access.isAdmin);
  const estimatedSiteCount = markers.length;

  const state = useMemo<MapCrowdState>(
    () => ({
      isAvailable: access.isAvailable,
      isSwitchedOff: access.isSwitchedOff,
      isStaff: access.isStaff,
      isTrailsBlocked,
      hidesPrivateCountries,
      estimatedSiteCount,
      estimatedSiteOverflow: overflow,
    }),
    [access.isAvailable, access.isSwitchedOff, access.isStaff, isTrailsBlocked, hidesPrivateCountries, estimatedSiteCount, overflow],
  );

  return { access, theme, markers, state, sharedSiteId, setSharedSiteId };
}
