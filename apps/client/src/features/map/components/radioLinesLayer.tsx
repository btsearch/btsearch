import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Popup } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useMap } from "@/components/ui/map";
import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import { usePreferences } from "@/hooks/usePreferences";
import { queryClient } from "@/lib/queryClient";
import type { RadioLine } from "@/types/station";

import { fetchRadioLineGroup } from "../api";
import { radioLinesToGeoJSON } from "../geojson";
import { useRadioLinesLayer } from "../hooks/useRadioLinesLayer";
import { type DuplexRadioLink, findDuplexLinkByRadioLineId, groupRadioLinesIntoLinks } from "../utils";
import { RadioLineFooter, RadioLinePopupContent } from "./radioLinePopupContent";

const EMPTY_LINES: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
const EMPTY_ENDPOINTS: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

type RadioLinesLayerProps = {
  radioLines: RadioLine[];
  pendingRadiolineId?: number | null;
  showAddToList?: boolean;
  onPendingRadiolineConsumed?: (id: null) => void;
};

export default function RadioLinesLayer({ radioLines, pendingRadiolineId, showAddToList, onPendingRadiolineConsumed }: RadioLinesLayerProps) {
  const { t } = useTranslation("common");
  const { map, isLoaded } = useMap();
  const { preferences } = usePreferences();
  const { openRadioLineDialog } = useFloatingDialogStack();

  const popupRef = useRef<Popup | null>(null);
  const popupRootRef = useRef<ReturnType<typeof createRoot> | null>(null);
  const consumedPendingIdRef = useRef<number | null>(null);

  const duplexLinks = useMemo(() => groupRadioLinesIntoLinks(radioLines), [radioLines]);

  const localPendingMatch = useMemo(() => {
    if (pendingRadiolineId === null || pendingRadiolineId === undefined) return null;
    return findDuplexLinkByRadioLineId(pendingRadiolineId, duplexLinks) ?? null;
  }, [duplexLinks, pendingRadiolineId]);

  const { data: pendingRadioLines, isError: isPendingRadioLinesError } = useQuery({
    queryKey: ["radiolines", "pending", pendingRadiolineId],
    queryFn: ({ signal }) => {
      if (pendingRadiolineId === null || pendingRadiolineId === undefined) throw new Error("Missing pending Radioline ID");
      return fetchRadioLineGroup(pendingRadiolineId, signal);
    },
    enabled: pendingRadiolineId !== null && pendingRadiolineId !== undefined && localPendingMatch === null,
    staleTime: 1000 * 60 * 5,
  });
  const fetchedPendingDuplexLinks = useMemo(() => groupRadioLinesIntoLinks(pendingRadioLines ?? []), [pendingRadioLines]);

  const { lines, endpoints } = useMemo(() => {
    if (!radioLines.length) return { lines: EMPTY_LINES, endpoints: EMPTY_ENDPOINTS };
    return radioLinesToGeoJSON(radioLines);
  }, [radioLines]);

  const cleanupPopup = useCallback(() => {
    const popup = popupRef.current;
    const popupRoot = popupRootRef.current;
    popupRef.current = null;
    popupRootRef.current = null;
    popup?.remove();
    popupRoot?.unmount();
  }, []);

  useEffect(() => cleanupPopup, [cleanupPopup]);

  const handleOpenDetails = useCallback(
    (link: DuplexRadioLink) => {
      if (openRadioLineDialog(link)) cleanupPopup();
    },
    [cleanupPopup, openRadioLineDialog],
  );

  const handleFeatureClick = useCallback(
    (links: DuplexRadioLink[], coordinates: [number, number]) => {
      if (!map) return;

      cleanupPopup();

      const container = document.createElement("div");
      container.className = "station-popup-container";

      const root = createRoot(container);
      popupRootRef.current = root;

      root.render(
        <QueryClientProvider client={queryClient}>
          {links.map((link) => (
            <RadioLinePopupContent key={link.groupId} link={link} showAddToList={showAddToList} onOpenDetails={handleOpenDetails} />
          ))}
          <RadioLineFooter coordinates={coordinates} />
        </QueryClientProvider>,
      );

      const popup = new Popup({
        closeButton: true,
        closeOnClick: true,
        maxWidth: "none",
        offset: 12,
      })
        .setLngLat(coordinates)
        .setDOMContent(container)
        .addTo(map);

      popupRef.current = popup;
      popup.on("close", () => {
        if (popupRef.current !== popup) return;
        const popupRoot = popupRootRef.current;
        popupRef.current = null;
        popupRootRef.current = null;
        popupRoot?.unmount();
      });
    },
    [map, cleanupPopup, handleOpenDetails, showAddToList],
  );

  useRadioLinesLayer({
    map,
    isLoaded,
    linesGeoJSON: lines,
    endpointsGeoJSON: endpoints,
    duplexLinks,
    minZoom: preferences.radiolinesMinZoom,
    onFeatureClick: handleFeatureClick,
  });

  const pendingMatch = useMemo(() => {
    if (localPendingMatch !== null) return localPendingMatch;
    if (pendingRadiolineId === null || pendingRadiolineId === undefined || fetchedPendingDuplexLinks.length === 0) return null;
    return findDuplexLinkByRadioLineId(pendingRadiolineId, fetchedPendingDuplexLinks) ?? null;
  }, [fetchedPendingDuplexLinks, localPendingMatch, pendingRadiolineId]);

  useEffect(() => {
    if (pendingRadiolineId === null || pendingRadiolineId === undefined) {
      consumedPendingIdRef.current = null;
      return;
    }
    if (consumedPendingIdRef.current === pendingRadiolineId) return;

    if (pendingMatch !== null) {
      consumedPendingIdRef.current = pendingRadiolineId;
      openRadioLineDialog(pendingMatch);
      onPendingRadiolineConsumed?.(null);
      return;
    }

    if (localPendingMatch === null && isPendingRadioLinesError) {
      consumedPendingIdRef.current = pendingRadiolineId;
      toast.error(t("placeholder.errorFetching"));
      onPendingRadiolineConsumed?.(null);
    }
  }, [isPendingRadioLinesError, localPendingMatch, onPendingRadiolineConsumed, openRadioLineDialog, pendingMatch, pendingRadiolineId, t]);

  return null;
}
