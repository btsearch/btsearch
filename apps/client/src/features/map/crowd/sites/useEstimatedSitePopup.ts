import { type Map as MapLibreMap, Popup } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";

import type { EstimatedSiteMarker } from "./estimatedSites";

export type OpenSitePopup = { popup: Popup; container: HTMLElement; marker: EstimatedSiteMarker };

const POPUP_OFFSET = 18;
const SHARED_SITE_ZOOM = 15;
const SHARED_SITE_FLIGHT_SPEED = 1.5;

export function useEstimatedSitePopup(map: MapLibreMap | null) {
  const [openPopup, setOpenPopup] = useState<OpenSitePopup | null>(null);
  const openPopupRef = useRef<OpenSitePopup | null>(null);
  const cancelFlightRef = useRef<(() => void) | null>(null);

  const showPopup = useCallback(
    (marker: EstimatedSiteMarker) => {
      if (!map) return;
      openPopupRef.current?.popup.remove();

      const container = document.createElement("div");
      container.className = "station-popup-container outline-none";
      container.tabIndex = -1;
      const popup = new Popup({ className: "station-map-popup", closeButton: false, closeOnClick: true, maxWidth: "none", offset: POPUP_OFFSET })
        .setLngLat([marker.longitude, marker.latitude])
        .setDOMContent(container);
      const entry: OpenSitePopup = { popup, container, marker };
      container.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        popup.remove();
      });
      void popup.once("close", () => {
        if (openPopupRef.current !== entry) return;
        openPopupRef.current = null;
        setOpenPopup(null);
      });

      openPopupRef.current = entry;
      setOpenPopup(entry);
      popup.addTo(map);
    },
    [map],
  );

  const flyToPopup = useCallback(
    (marker: EstimatedSiteMarker) => {
      if (!map) return;
      cancelFlightRef.current?.();
      const showAfterFlight = () => {
        cancelFlightRef.current = null;
        showPopup(marker);
      };
      map.flyTo({
        center: [marker.longitude, marker.latitude],
        zoom: Math.max(map.getZoom(), SHARED_SITE_ZOOM),
        essential: true,
        speed: SHARED_SITE_FLIGHT_SPEED,
      });
      void map.once("moveend", showAfterFlight);
      cancelFlightRef.current = () => map.off("moveend", showAfterFlight);
    },
    [map, showPopup],
  );

  useEffect(() => {
    return () => {
      cancelFlightRef.current?.();
      const entry = openPopupRef.current;
      openPopupRef.current = null;
      entry?.popup.remove();
    };
  }, []);

  return { openPopup, showPopup, flyToPopup };
}
