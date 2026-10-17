import type { MicrowaveLink } from "@openbts/shared/contract";
import { QueryClientProvider, skipToken, useQuery } from "@tanstack/react-query";
import type { FeatureCollection } from "geojson";
import { Popup } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { fetchMicrowaveLinkGroup } from "../api";
import { useMapLookups } from "../data/mapLookups";
import { microwaveLinksToGeoJSON } from "../geojson";
import { useMicrowaveLinksLayer } from "../hooks/useMicrowaveLinksLayer";
import { type DuplexMicrowaveLink, findDuplexLinkByMicrowaveLinkId, groupMicrowaveLinksIntoDuplexLinks } from "../utils";
import { MicrowaveLinkPopupContent } from "./microwaveLinkPopupContent";
import { PopupCoordinatesFooter } from "./popupParts";
import { useMap } from "@/components/ui/map";
import { useFloatingDialogStack } from "@/features/floating-dialogs/components/floatingDialogStackProvider";
import { usePreferences } from "@/hooks/usePreferences";
import { queryClient } from "@/lib/queryClient";

const EMPTY_LINES: FeatureCollection = { type: "FeatureCollection", features: [] };
const EMPTY_ENDPOINTS: FeatureCollection = { type: "FeatureCollection", features: [] };

type MicrowaveLinksLayerProps = {
  microwaveLinks: MicrowaveLink[];
  pendingMicrowaveLinkId?: number | null;
  showAddToList?: boolean;
  isPickingReceiver?: boolean;
  onPendingMicrowaveLinkConsumed?: (id: null) => void;
};

export default function MicrowaveLinksLayer({
  microwaveLinks,
  pendingMicrowaveLinkId,
  showAddToList,
  isPickingReceiver = false,
  onPendingMicrowaveLinkConsumed,
}: MicrowaveLinksLayerProps) {
  const { t } = useTranslation("common");
  const { map, isLoaded } = useMap();
  const { preferences } = usePreferences();
  const { lookups } = useMapLookups();
  const { openMicrowaveLinkDialog } = useFloatingDialogStack();

  const popupRef = useRef<Popup | null>(null);
  const popupRootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const consumedPendingIdRef = useRef<number | null>(null);

  const duplexLinks = useMemo(() => groupMicrowaveLinksIntoDuplexLinks(microwaveLinks), [microwaveLinks]);

  const localPendingMatch = useMemo(() => {
    if (pendingMicrowaveLinkId === null || pendingMicrowaveLinkId === undefined) return null;
    return findDuplexLinkByMicrowaveLinkId(pendingMicrowaveLinkId, duplexLinks) ?? null;
  }, [duplexLinks, pendingMicrowaveLinkId]);

  const { data: pendingMicrowaveLinks, isError: isPendingMicrowaveLinksError } = useQuery({
    queryKey: ["microwave-links", "pending", pendingMicrowaveLinkId],
    queryFn:
      pendingMicrowaveLinkId === null || pendingMicrowaveLinkId === undefined
        ? skipToken
        : ({ signal }) => fetchMicrowaveLinkGroup(pendingMicrowaveLinkId, signal),
    enabled: localPendingMatch === null,
    staleTime: 1000 * 60 * 5,
  });
  const fetchedPendingDuplexLinks = useMemo(() => groupMicrowaveLinksIntoDuplexLinks(pendingMicrowaveLinks ?? []), [pendingMicrowaveLinks]);

  const { lines, endpoints } = useMemo(() => {
    if (!duplexLinks.length) return { lines: EMPTY_LINES, endpoints: EMPTY_ENDPOINTS };
    return microwaveLinksToGeoJSON(duplexLinks, lookups);
  }, [duplexLinks, lookups]);

  const cleanupPopup = useCallback(() => {
    const popup = popupRef.current;
    const popupRoot = popupRootRef.current;
    popupRef.current = null;
    popupRootRef.current = null;
    popup?.remove();
    if (popupRoot) queueMicrotask(() => popupRoot.unmount());
  }, []);

  useEffect(() => cleanupPopup, [cleanupPopup]);

  const handleOpenDetails = useCallback(
    (link: DuplexMicrowaveLink) => {
      if (openMicrowaveLinkDialog(link)) cleanupPopup();
    },
    [cleanupPopup, openMicrowaveLinkDialog],
  );

  const handleFeatureClick = useCallback(
    (links: DuplexMicrowaveLink[], coordinates: [number, number]) => {
      if (!map) return;

      cleanupPopup();

      const container = document.createElement("div");
      container.className = "station-popup-container outline-none";
      container.tabIndex = -1;

      const popup = new Popup({
        className: "station-map-popup",
        closeButton: false,
        closeOnClick: true,
        maxWidth: "none",
        offset: 12,
      })
        .setLngLat(coordinates)
        .setDOMContent(container);
      container.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        popup.remove();
      });

      const root = createRoot(container);
      popupRootRef.current = root;

      root.render(
        <QueryClientProvider client={queryClient}>
          <div className="w-72 text-sm">
            <div className="custom-scrollbar max-h-72 overflow-x-hidden overflow-y-auto">
              {links.map((link, index) => (
                <MicrowaveLinkPopupContent
                  key={link.groupId}
                  link={link}
                  showAddToList={showAddToList}
                  onOpenDetails={handleOpenDetails}
                  onClose={index === 0 ? () => popup.remove() : undefined}
                />
              ))}
            </div>
            <PopupCoordinatesFooter latitude={coordinates[1]} longitude={coordinates[0]} />
          </div>
        </QueryClientProvider>,
      );

      popupRef.current = popup;
      popup.on("close", () => {
        if (popupRef.current !== popup) return;
        const popupRoot = popupRootRef.current;
        popupRef.current = null;
        popupRootRef.current = null;
        if (popupRoot) queueMicrotask(() => popupRoot.unmount());
      });
      popup.addTo(map);
    },
    [map, cleanupPopup, handleOpenDetails, showAddToList],
  );

  useMicrowaveLinksLayer({
    map,
    isLoaded,
    linesGeoJSON: lines,
    endpointsGeoJSON: endpoints,
    duplexLinks,
    lookups,
    minZoom: preferences.radiolinesMinZoom,
    isPickingReceiver,
    onFeatureClick: handleFeatureClick,
  });

  const pendingMatch = useMemo(() => {
    if (localPendingMatch !== null) return localPendingMatch;
    if (pendingMicrowaveLinkId === null || pendingMicrowaveLinkId === undefined || fetchedPendingDuplexLinks.length === 0) return null;
    return findDuplexLinkByMicrowaveLinkId(pendingMicrowaveLinkId, fetchedPendingDuplexLinks) ?? null;
  }, [fetchedPendingDuplexLinks, localPendingMatch, pendingMicrowaveLinkId]);

  useEffect(() => {
    if (pendingMicrowaveLinkId === null || pendingMicrowaveLinkId === undefined) {
      consumedPendingIdRef.current = null;
      return;
    }
    if (consumedPendingIdRef.current === pendingMicrowaveLinkId) return;

    if (pendingMatch !== null) {
      consumedPendingIdRef.current = pendingMicrowaveLinkId;
      openMicrowaveLinkDialog(pendingMatch);
      onPendingMicrowaveLinkConsumed?.(null);
      return;
    }

    if (localPendingMatch === null && isPendingMicrowaveLinksError) {
      consumedPendingIdRef.current = pendingMicrowaveLinkId;
      toast.error(t("error.loadTitle"));
      onPendingMicrowaveLinkConsumed?.(null);
    }
  }, [
    isPendingMicrowaveLinksError,
    localPendingMatch,
    onPendingMicrowaveLinkConsumed,
    openMicrowaveLinkDialog,
    pendingMatch,
    pendingMicrowaveLinkId,
    t,
  ]);

  return null;
}
