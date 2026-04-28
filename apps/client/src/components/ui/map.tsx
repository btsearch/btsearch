"use client";

import { Cancel01Icon, CompassIcon, Location01Icon, MaximizeIcon, MinusSignIcon, PlusSignIcon } from "@hugeicons/core-free-icons";
import "maplibre-gl/dist/maplibre-gl.css";
import { HugeiconsIcon } from "@hugeicons/react";
import MapLibreGL, { type MarkerOptions, type PopupOptions } from "maplibre-gl";
import {
  type ReactNode,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

import { NavigationLinks } from "@/features/station-details/components/navLinks";
import { useClickOutside } from "@/hooks/useClickOutside";
import { type GpsFormat, usePreferences } from "@/hooks/usePreferences";
import { formatCoordinates } from "@/lib/gpsUtils";
import { cn } from "@/lib/utils";

import { Spinner } from "./spinner";

// Check document class for theme (works with next-themes, etc.)
function getDocumentTheme(): Theme | null {
  if (typeof document === "undefined") return null;
  if (document.documentElement.classList.contains("dark")) return "dark";
  if (document.documentElement.classList.contains("light")) return "light";
  return null;
}

// Get system preference
function getSystemTheme(): Theme {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getThemeSnapshot(): Theme {
  return getDocumentTheme() ?? getSystemTheme();
}

function getThemeServerSnapshot(): Theme {
  return "light";
}

function subscribeToTheme(callback: () => void): () => void {
  // Watch for document class changes (e.g., next-themes toggling dark class)
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  // Also watch for system preference changes
  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  mediaQuery.addEventListener("change", callback);

  return () => {
    observer.disconnect();
    mediaQuery.removeEventListener("change", callback);
  };
}

function useResolvedTheme(themeProp?: "light" | "dark"): "light" | "dark" {
  const detectedTheme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getThemeServerSnapshot);
  return themeProp ?? detectedTheme;
}

type MapStyle = "carto" | "osm" | "openfreemap" | "satellite" | "esriSatellite" | "opentopomap";

type MapContextValue = {
  map: MapLibreGL.Map | null;
  isLoaded: boolean;
  mapStyle: MapStyle;
  setMapStyle: (style: MapStyle) => void;
};

const MapContext = createContext<MapContextValue | null>(null);

/**
 * Callbacks to remove event listeners before switching map styles.
 *
 * Changing the map style destroys all layers, so any click/hover listeners
 * attached to those layers must be removed first or they'll crash.
 */
const beforeStyleChangeCallbacks = new WeakMap<MapLibreGL.Map, Set<() => void>>();

function onBeforeStyleChange(map: MapLibreGL.Map, callback: () => void): () => void {
  let set = beforeStyleChangeCallbacks.get(map);
  if (!set) {
    set = new Set();
    beforeStyleChangeCallbacks.set(map, set);
  }
  set.add(callback);
  return () => {
    set.delete(callback);
  };
}

function fireBeforeStyleChange(map: MapLibreGL.Map): void {
  const set = beforeStyleChangeCallbacks.get(map);
  if (set) {
    for (const cb of set) cb();
  }
}

function getViewport(map: MapLibreGL.Map): MapViewport {
  const center = map.getCenter();
  return {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

function useMap() {
  const context = useContext(MapContext);
  if (!context) {
    throw new Error("useMap must be used within a Map component");
  }
  return context;
}

type MapStyleOption = string | MapLibreGL.StyleSpecification;

export const CARTO_STYLE_URLS = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
} as const;

const defaultStyles = CARTO_STYLE_URLS;

const osmRasterStyle: MapLibreGL.StyleSpecification = {
  version: 8,
  sources: {
    "osm-raster-tiles": {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [
    {
      id: "osm-raster-layer",
      type: "raster",
      source: "osm-raster-tiles",
      minzoom: 0,
    },
  ],
};

const opentopomapRasterStyle: MapLibreGL.StyleSpecification = {
  version: 8,
  sources: {
    "opentopomap-raster-tiles": {
      type: "raster",
      tiles: [
        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 17,
      attribution:
        'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    },
  },
  layers: [
    {
      id: "opentopomap-raster-layer",
      type: "raster",
      source: "opentopomap-raster-tiles",
      minzoom: 0,
    },
  ],
};

const googleSatelliteRasterStyle: MapLibreGL.StyleSpecification = {
  version: 8,
  sources: {
    "google-satellite-tiles": {
      type: "raster",
      tiles: [
        "https://mt0.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        "https://mt2.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        "https://mt3.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
      ],
      tileSize: 256,
      maxzoom: 18,
      attribution: "Map data &copy;2026 Google Satellite imagery and respective authors",
    },
  },
  layers: [
    {
      id: "google-satellite-layer",
      type: "raster",
      source: "google-satellite-tiles",
      minzoom: 0,
    },
  ],
};

const esriSatelliteRasterStyle: MapLibreGL.StyleSpecification = {
  version: 8,
  sources: {
    "esri-satellite-tiles": {
      type: "raster",
      tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
    },
  },
  layers: [
    {
      id: "esri-satellite-layer",
      type: "raster",
      source: "esri-satellite-tiles",
      minzoom: 0,
    },
  ],
};

const mapStyleOptions: Record<
  MapStyle,
  {
    dark: MapStyleOption;
    light: MapStyleOption;
    label: string;
    thumbnail: string;
  }
> = {
  carto: {
    dark: CARTO_STYLE_URLS.dark,
    light: CARTO_STYLE_URLS.light,
    label: "Standard",
    thumbnail: "https://a.basemaps.cartocdn.com/dark_all/13/4400/2686.png",
  },
  osm: {
    dark: osmRasterStyle,
    light: osmRasterStyle,
    label: "OpenStreetMap",
    thumbnail: "https://tile.openstreetmap.org/13/4400/2686.png",
  },
  openfreemap: {
    dark: "https://tiles.openfreemap.org/styles/bright",
    light: "https://tiles.openfreemap.org/styles/bright",
    label: "OpenFreeMap",
    thumbnail: "https://a.basemaps.cartocdn.com/light_all/13/4400/2686.png",
  },
  satellite: {
    dark: googleSatelliteRasterStyle,
    light: googleSatelliteRasterStyle,
    label: "Google Satellite",
    thumbnail: "https://mt0.google.com/vt/lyrs=s&x=4400&y=2686&z=13",
  },
  opentopomap: {
    dark: opentopomapRasterStyle,
    light: opentopomapRasterStyle,
    label: "OpenTopoMap",
    thumbnail: "https://a.tile.opentopomap.org/13/4400/2686.png",
  },
  esriSatellite: {
    dark: esriSatelliteRasterStyle,
    light: esriSatelliteRasterStyle,
    label: "Esri Satellite",
    thumbnail: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/13/2686/4400",
  },
};

type Theme = "light" | "dark";

type MapViewport = {
  /** Center coordinates [longitude, latitude] */
  center: [number, number];
  /** Zoom level */
  zoom: number;
  /** Bearing (rotation) in degrees */
  bearing: number;
  /** Pitch (tilt) in degrees */
  pitch: number;
};

type MapProps = {
  children?: ReactNode;
  /** Additional CSS classes for the map container */
  className?: string;
  /**
   * Theme for the map. If not provided, automatically detects system preference.
   * Pass your theme value here.
   */
  theme?: Theme;
  /** Custom map styles for light and dark themes. Overrides the default Carto styles. */
  styles?: {
    light?: MapStyleOption;
    dark?: MapStyleOption;
  };
  /** Initial map style preset (default: "carto") */
  initialMapStyle?: MapStyle;
  /** Map projection type. Use `{ type: "globe" }` for 3D globe view. */
  projection?: MapLibreGL.ProjectionSpecification;
  /**
   * Controlled viewport. When provided with onViewportChange,
   * the map becomes controlled and viewport is driven by this prop.
   */
  viewport?: Partial<MapViewport>;
  /**
   * Callback fired continuously as the viewport changes (pan, zoom, rotate, pitch).
   * When used with `viewport` prop, enables controlled mode.
   * Receives the new viewport state to update your state.
   */
  onViewportChange?: (viewport: MapViewport) => void;
} & Omit<MapLibreGL.MapOptions, "container" | "style">;

type MapRef = MapLibreGL.Map;

const DefaultLoader = () => (
  <div className="absolute inset-0 flex items-center justify-center">
    <div className="flex gap-1">
      <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse" />
      <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:150ms]" />
      <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-pulse [animation-delay:300ms]" />
    </div>
  </div>
);

type MapInstanceState = {
  mapInstance: MapLibreGL.Map | null;
  isLoaded: boolean;
  isStyleLoaded: boolean;
};
type MapInstanceAction =
  | { type: "INIT"; map: MapLibreGL.Map }
  | { type: "SET_LOADED" }
  | { type: "SET_STYLE_LOADED"; value?: boolean }
  | { type: "TEARDOWN" };

function mapInstanceReducer(state: MapInstanceState, action: MapInstanceAction): MapInstanceState {
  switch (action.type) {
    case "INIT":
      return { mapInstance: action.map, isLoaded: false, isStyleLoaded: false };
    case "SET_LOADED":
      return { ...state, isLoaded: true };
    case "SET_STYLE_LOADED":
      return { ...state, isStyleLoaded: action.value ?? true };
    case "TEARDOWN":
      return { mapInstance: null, isLoaded: false, isStyleLoaded: false };
    default:
      return state;
  }
}

const MapComponent = forwardRef<MapRef, MapProps>(function MapComponent(
  { children, theme: themeProp, className, styles, initialMapStyle = "carto", projection, viewport, onViewportChange, ...props },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapState, dispatchMap] = useReducer(mapInstanceReducer, {
    mapInstance: null,
    isLoaded: false,
    isStyleLoaded: false,
  });
  const { mapInstance, isLoaded, isStyleLoaded } = mapState;
  const [mapStyle, setMapStyle] = useState<MapStyle>(() => {
    if (typeof window === "undefined") return initialMapStyle;
    const saved = localStorage.getItem("map-style");
    return (saved as MapStyle) || initialMapStyle;
  });
  const currentStyleRef = useRef<MapStyleOption | null>(null);
  const styleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const internalUpdateRef = useRef(false);
  const resolvedTheme = useResolvedTheme(themeProp);
  const { preferences } = usePreferences();

  const effectiveTheme: "light" | "dark" = mapStyle === "carto" && preferences.cartoVariant !== "auto" ? preferences.cartoVariant : resolvedTheme;

  const effectiveThemeRef = useRef<"light" | "dark">(effectiveTheme);
  useEffect(() => {
    effectiveThemeRef.current = effectiveTheme;
  });

  const isControlled = viewport !== undefined && onViewportChange !== undefined;

  const onViewportChangeRef = useRef(onViewportChange);
  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });

  const mapStyles = useMemo(() => {
    if (styles?.dark || styles?.light) {
      return {
        dark: styles?.dark ?? defaultStyles.dark,
        light: styles?.light ?? defaultStyles.light,
      };
    }
    return {
      dark: mapStyleOptions[mapStyle].dark,
      light: mapStyleOptions[mapStyle].light,
    };
  }, [styles, mapStyle]);

  const initialStyleRef = useRef({ dark: mapStyles.dark, light: mapStyles.light });

  const handleSetMapStyle = useCallback((style: MapStyle) => {
    setMapStyle(style);
    localStorage.setItem("map-style", style);
  }, []);

  useImperativeHandle(ref, () => mapInstance as MapLibreGL.Map, [mapInstance]);

  const clearStyleTimeout = useCallback(() => {
    if (styleTimeoutRef.current) {
      clearTimeout(styleTimeoutRef.current);
      styleTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const initStyles = initialStyleRef.current;
    const initialStyle = effectiveThemeRef.current === "dark" ? initStyles.dark : initStyles.light;
    currentStyleRef.current = initialStyle;

    const map = new MapLibreGL.Map({
      container: containerRef.current,
      style: initialStyle,
      renderWorldCopies: false,
      attributionControl: {
        compact: true,
      },
      ...propsRef.current,
      ...viewport,
    });

    // MapLibre sets _style = null mid setStyle(). A mousemove in that window crashes on getLayer()
    // Return undefined instead of throwing, same as "layer not found"
    const _originalGetLayer = map.getLayer.bind(map);
    map.getLayer = (id: string) => {
      try {
        return _originalGetLayer(id);
      } catch {
        return undefined;
      }
    };

    const styleDataHandler = () => {
      clearStyleTimeout();
      // Delay to ensure style is fully processed before allowing layer operations
      // This is a workaround to avoid race conditions with the style loading
      // else we have to force update every layer on setStyle change
      styleTimeoutRef.current = setTimeout(() => {
        dispatchMap({ type: "SET_STYLE_LOADED" });
        if (projection) {
          map.setProjection(projection);
        }

        const currentStyle = currentStyleRef.current;
        const isRasterOnlyStyle =
          currentStyle === osmRasterStyle ||
          currentStyle === opentopomapRasterStyle ||
          currentStyle === googleSatelliteRasterStyle ||
          currentStyle === esriSatelliteRasterStyle;

        if (isRasterOnlyStyle && typeof currentStyle !== "string" && currentStyle?.sources) {
          let maxSourceZoom = 21;
          Object.values(currentStyle.sources).forEach((source) => {
            if (source.type === "raster" && "maxzoom" in source && typeof source.maxzoom === "number") {
              maxSourceZoom = Math.min(maxSourceZoom, source.maxzoom);
            }
          });
          map.setMaxZoom(maxSourceZoom);
        } else {
          map.setMaxZoom(21);
        }
      }, 100);
    };
    const loadHandler = () => dispatchMap({ type: "SET_LOADED" });
    const handleMove = () => {
      if (internalUpdateRef.current) return;
      onViewportChangeRef.current?.(getViewport(map));
    };

    map.on("load", loadHandler);
    map.on("styledata", styleDataHandler);
    map.on("move", handleMove);
    dispatchMap({ type: "INIT", map });

    return () => {
      clearStyleTimeout();
      map.off("load", loadHandler);
      map.off("styledata", styleDataHandler);
      map.off("move", handleMove);
      map.remove();
      dispatchMap({ type: "TEARDOWN" });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projection, clearStyleTimeout]);

  useEffect(() => {
    if (!mapInstance || !isControlled || !viewport) return;
    if (mapInstance.isMoving()) return;

    const current = getViewport(mapInstance);
    const next = {
      center: viewport.center ?? current.center,
      zoom: viewport.zoom ?? current.zoom,
      bearing: viewport.bearing ?? current.bearing,
      pitch: viewport.pitch ?? current.pitch,
    };

    if (
      next.center[0] === current.center[0] &&
      next.center[1] === current.center[1] &&
      next.zoom === current.zoom &&
      next.bearing === current.bearing &&
      next.pitch === current.pitch
    ) {
      return;
    }

    internalUpdateRef.current = true;
    mapInstance.jumpTo(next);
  }, [mapInstance, isControlled, viewport]);

  useEffect(() => {
    if (!mapInstance || !effectiveTheme) return;

    const newStyle = effectiveTheme === "dark" ? mapStyles.dark : mapStyles.light;

    if (currentStyleRef.current === newStyle) return;

    clearStyleTimeout();
    currentStyleRef.current = newStyle;
    dispatchMap({ type: "SET_STYLE_LOADED", value: false });

    fireBeforeStyleChange(mapInstance);

    const isRasterStyle =
      newStyle === osmRasterStyle ||
      newStyle === opentopomapRasterStyle ||
      newStyle === googleSatelliteRasterStyle ||
      newStyle === esriSatelliteRasterStyle;

    try {
      mapInstance.setStyle(newStyle, { diff: !isRasterStyle });
    } catch {
      mapInstance.setStyle(newStyle, { diff: false });
    }
  }, [mapInstance, effectiveTheme, mapStyles, clearStyleTimeout]);

  const contextValue = useMemo(
    () => ({
      map: mapInstance,
      isLoaded: isLoaded && isStyleLoaded,
      mapStyle,
      setMapStyle: handleSetMapStyle,
    }),
    [mapInstance, isLoaded, isStyleLoaded, mapStyle, handleSetMapStyle],
  );

  return (
    <MapContext.Provider value={contextValue}>
      <div ref={containerRef} className={cn("relative w-full h-full", className)}>
        {!isLoaded && <DefaultLoader />}
        {mapInstance && children}
      </div>
    </MapContext.Provider>
  );
});

type MarkerContextValue = {
  marker: MapLibreGL.Marker;
  map: MapLibreGL.Map | null;
};

const MarkerContext = createContext<MarkerContextValue | null>(null);

function useMarkerContext() {
  const context = useContext(MarkerContext);
  if (!context) {
    throw new Error("Marker components must be used within MapMarker");
  }
  return context;
}

type MapMarkerProps = {
  /** Longitude coordinate for marker position */
  longitude: number;
  /** Latitude coordinate for marker position */
  latitude: number;
  /** Marker subcomponents (MarkerContent, MarkerPopup, MarkerTooltip, MarkerLabel) */
  children: ReactNode;
  /** Callback when marker is clicked */
  onClick?: (e: MouseEvent) => void;
  /** Callback when mouse enters marker */
  onMouseEnter?: (e: MouseEvent) => void;
  /** Callback when mouse leaves marker */
  onMouseLeave?: (e: MouseEvent) => void;
  /** Callback when marker drag starts (requires draggable: true) */
  onDragStart?: (lngLat: { lng: number; lat: number }) => void;
  /** Callback during marker drag (requires draggable: true) */
  onDrag?: (lngLat: { lng: number; lat: number }) => void;
  /** Callback when marker drag ends (requires draggable: true) */
  onDragEnd?: (lngLat: { lng: number; lat: number }) => void;
} & Omit<MarkerOptions, "element">;

function MapMarker({
  longitude,
  latitude,
  children,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onDragStart,
  onDrag,
  onDragEnd,
  draggable = false,
  offset: markerOffset,
  rotation: markerRotation,
  rotationAlignment: markerRotationAlignment,
  pitchAlignment: markerPitchAlignment,
  scale: markerScale,
  anchor: markerAnchor,
  color: markerColor,
  clickTolerance: markerClickTolerance,
}: MapMarkerProps) {
  const { map } = useMap();

  const callbacksRef = useRef({
    onClick,
    onMouseEnter,
    onMouseLeave,
    onDragStart,
    onDrag,
    onDragEnd,
  });
  useEffect(() => {
    callbacksRef.current = {
      onClick,
      onMouseEnter,
      onMouseLeave,
      onDragStart,
      onDrag,
      onDragEnd,
    };
  }, [onClick, onMouseEnter, onMouseLeave, onDragStart, onDrag, onDragEnd]);

  const marker = useMemo(() => {
    const markerInstance = new MapLibreGL.Marker({
      element: document.createElement("div"),
      draggable,
      offset: markerOffset,
      rotation: markerRotation,
      rotationAlignment: markerRotationAlignment,
      pitchAlignment: markerPitchAlignment,
      scale: markerScale,
      anchor: markerAnchor,
      color: markerColor,
      clickTolerance: markerClickTolerance,
    }).setLngLat([longitude, latitude]);
    return markerInstance;
  }, [
    draggable,
    latitude,
    longitude,
    markerOffset,
    markerRotation,
    markerRotationAlignment,
    markerPitchAlignment,
    markerScale,
    markerAnchor,
    markerColor,
    markerClickTolerance,
  ]);

  useEffect(() => {
    if (!map) return;

    const handleClick = (e: MouseEvent) => callbacksRef.current.onClick?.(e);
    const handleMouseEnter = (e: MouseEvent) => callbacksRef.current.onMouseEnter?.(e);
    const handleMouseLeave = (e: MouseEvent) => callbacksRef.current.onMouseLeave?.(e);
    const el = marker.getElement();
    el?.addEventListener("click", handleClick);
    el?.addEventListener("mouseenter", handleMouseEnter);
    el?.addEventListener("mouseleave", handleMouseLeave);

    const handleDragStart = () => {
      const lngLat = marker.getLngLat();
      callbacksRef.current.onDragStart?.({ lng: lngLat.lng, lat: lngLat.lat });
    };
    const handleDrag = () => {
      const lngLat = marker.getLngLat();
      callbacksRef.current.onDrag?.({ lng: lngLat.lng, lat: lngLat.lat });
    };
    const handleDragEnd = () => {
      const lngLat = marker.getLngLat();
      callbacksRef.current.onDragEnd?.({ lng: lngLat.lng, lat: lngLat.lat });
    };
    marker.on("dragstart", handleDragStart);
    marker.on("drag", handleDrag);
    marker.on("dragend", handleDragEnd);

    marker.addTo(map);

    return () => {
      el?.removeEventListener("click", handleClick);
      el?.removeEventListener("mouseenter", handleMouseEnter);
      el?.removeEventListener("mouseleave", handleMouseLeave);
      marker.off("dragstart", handleDragStart);
      marker.off("drag", handleDrag);
      marker.off("dragend", handleDragEnd);
      marker.remove();
    };
  }, [map, marker]);

  useEffect(() => {
    marker.setLngLat([longitude, latitude]);
    marker.setDraggable(draggable);
    marker.setOffset(markerOffset ?? [0, 0]);
    marker.setRotation(markerRotation ?? 0);
    marker.setRotationAlignment(markerRotationAlignment ?? "auto");
    marker.setPitchAlignment(markerPitchAlignment ?? "auto");
  }, [marker, longitude, latitude, draggable, markerOffset, markerRotation, markerRotationAlignment, markerPitchAlignment]);

  return <MarkerContext.Provider value={{ marker, map }}>{children}</MarkerContext.Provider>;
}

type MarkerContentProps = {
  /** Custom marker content. Defaults to a blue dot if not provided */
  children?: ReactNode;
  /** Additional CSS classes for the marker container */
  className?: string;
};

function MarkerContent({ children, className }: MarkerContentProps) {
  const { marker } = useMarkerContext();

  return createPortal(<div className={cn("relative cursor-pointer", className)}>{children || <DefaultMarkerIcon />}</div>, marker.getElement());
}

function DefaultMarkerIcon() {
  return <div className="relative h-4 w-4 rounded-full border-2 border-white bg-blue-500 shadow-lg" />;
}

type MarkerPopupProps = {
  /** Popup content */
  children: ReactNode;
  /** Additional CSS classes for the popup container */
  className?: string;
  /** Show a close button in the popup (default: false) */
  closeButton?: boolean;
} & Omit<PopupOptions, "className" | "closeButton">;

function MarkerPopup({
  children,
  className,
  closeButton = false,
  offset: popupOffset,
  maxWidth: popupMaxWidth,
  anchor: popupAnchor,
  closeOnClick: popupCloseOnClick,
  closeOnMove: popupCloseOnMove,
  focusAfterOpen: popupFocusAfterOpen,
}: MarkerPopupProps) {
  const { marker, map } = useMarkerContext();
  const container = useMemo(() => document.createElement("div"), []);

  const popup = useMemo(() => {
    const popupInstance = new MapLibreGL.Popup({
      offset: popupOffset ?? 16,
      maxWidth: popupMaxWidth,
      anchor: popupAnchor,
      closeOnClick: popupCloseOnClick,
      closeOnMove: popupCloseOnMove,
      focusAfterOpen: popupFocusAfterOpen,
      closeButton: false,
    })
      .setMaxWidth("none")
      .setDOMContent(container);

    return popupInstance;
  }, [popupOffset, popupMaxWidth, popupAnchor, popupCloseOnClick, popupCloseOnMove, popupFocusAfterOpen, container]);

  useEffect(() => {
    if (!map) return;

    popup.setDOMContent(container);
    marker.setPopup(popup);

    return () => {
      marker.setPopup(null);
    };
  }, [map, container, marker, popup]);

  useEffect(() => {
    if (!popup.isOpen()) return;
    popup.setOffset(popupOffset ?? 16);
    if (popupMaxWidth) popup.setMaxWidth(popupMaxWidth);
  }, [popup, popupOffset, popupMaxWidth]);

  const handleClose = () => popup.remove();

  return createPortal(
    <div className={cn("relative rounded-md border bg-popover p-3 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95", className)}>
      {closeButton && (
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-1 right-1 z-10 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="Close popup"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      )}
      {children}
    </div>,
    container,
  );
}

type MarkerTooltipProps = {
  /** Tooltip content */
  children: ReactNode;
  /** Additional CSS classes for the tooltip container */
  className?: string;
} & Omit<PopupOptions, "className" | "closeButton" | "closeOnClick">;

function MarkerTooltip({
  children,
  className,
  offset: tooltipOffset,
  maxWidth: tooltipMaxWidth,
  anchor: tooltipAnchor,
  closeOnMove: tooltipCloseOnMove,
  focusAfterOpen: tooltipFocusAfterOpen,
}: MarkerTooltipProps) {
  const { marker, map } = useMarkerContext();
  const container = useMemo(() => document.createElement("div"), []);

  const tooltip = useMemo(() => {
    const tooltipInstance = new MapLibreGL.Popup({
      offset: tooltipOffset ?? 16,
      maxWidth: tooltipMaxWidth,
      anchor: tooltipAnchor,
      closeOnMove: tooltipCloseOnMove,
      focusAfterOpen: tooltipFocusAfterOpen,
      closeOnClick: true,
      closeButton: false,
    }).setMaxWidth("none");

    return tooltipInstance;
  }, [tooltipOffset, tooltipMaxWidth, tooltipAnchor, tooltipCloseOnMove, tooltipFocusAfterOpen]);

  useEffect(() => {
    if (!map) return;

    tooltip.setDOMContent(container);

    const handleMouseEnter = () => {
      tooltip.setLngLat(marker.getLngLat()).addTo(map);
    };
    const handleMouseLeave = () => tooltip.remove();

    marker.getElement()?.addEventListener("mouseenter", handleMouseEnter);
    marker.getElement()?.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      marker.getElement()?.removeEventListener("mouseenter", handleMouseEnter);
      marker.getElement()?.removeEventListener("mouseleave", handleMouseLeave);
      tooltip.remove();
    };
  }, [map, container, marker, tooltip]);

  useEffect(() => {
    if (!tooltip.isOpen()) return;
    tooltip.setOffset(tooltipOffset ?? 16);
    if (tooltipMaxWidth) tooltip.setMaxWidth(tooltipMaxWidth);
  }, [tooltip, tooltipOffset, tooltipMaxWidth]);

  return createPortal(
    <div className={cn("rounded-md bg-foreground px-2 py-1 text-xs text-background shadow-md animate-in fade-in-0 zoom-in-95", className)}>
      {children}
    </div>,
    container,
  );
}

type MarkerLabelProps = {
  /** Label text content */
  children: ReactNode;
  /** Additional CSS classes for the label */
  className?: string;
  /** Position of the label relative to the marker (default: "top") */
  position?: "top" | "bottom";
};

function MarkerLabel({ children, className, position = "top" }: MarkerLabelProps) {
  const positionClasses = {
    top: "bottom-full mb-1",
    bottom: "top-full mt-1",
  };

  return (
    <div
      className={cn(
        "absolute left-1/2 -translate-x-1/2 whitespace-nowrap",
        "text-[10px] font-medium text-foreground",
        positionClasses[position],
        className,
      )}
    >
      {children}
    </div>
  );
}

const GPS_DOT = (
  <div className="relative flex cursor-pointer items-center justify-center">
    <div className="absolute h-5 w-5 animate-ping rounded-full bg-blue-500/40" />
    <div className="relative h-3 w-3 rounded-full border-2 border-white bg-blue-500 shadow-md" />
  </div>
);

type UserLocationMarkerProps = {
  longitude: number;
  latitude: number;
  accuracy: number;
  gpsFormat: GpsFormat;
};

function UserLocationMarker({ longitude, latitude, accuracy, gpsFormat }: UserLocationMarkerProps) {
  const { map } = useMap();
  const { t } = useTranslation("main");
  const markerRef = useRef<MapLibreGL.Marker | null>(null);
  const [markerEl, setMarkerEl] = useState<HTMLDivElement | null>(null);
  const [popupContainer, setPopupContainer] = useState<HTMLDivElement | null>(null);

  const animFrameRef = useRef<number | null>(null);
  const animFromRef = useRef<{ longitude: number; latitude: number } | null>(null);

  useEffect(() => {
    if (!map) return;
    const el = document.createElement("div");
    const container = document.createElement("div");
    const popup = new MapLibreGL.Popup({ closeButton: true, closeOnClick: true, offset: 16 }).setDOMContent(container);
    const marker = new MapLibreGL.Marker({ element: el }).setLngLat([longitude, latitude]).setPopup(popup).addTo(map);
    markerRef.current = marker;
    animFromRef.current = { longitude, latitude };
    setMarkerEl(el);
    setPopupContainer(container);
    return () => {
      marker.remove();
      popup.remove();
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const from = animFromRef.current ?? { longitude, latitude };
    const to = { longitude, latitude };

    if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);

    const start = performance.now();
    const duration = 800;

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - (1 - t) ** 3; // ease-out cubic
      const lng = from.longitude + (to.longitude - from.longitude) * eased;
      const lat = from.latitude + (to.latitude - from.latitude) * eased;
      marker.setLngLat([lng, lat]);
      animFromRef.current = { longitude: lng, latitude: lat };
      if (t < 1) animFrameRef.current = requestAnimationFrame(tick);
      else animFrameRef.current = null;
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current !== null) cancelAnimationFrame(animFrameRef.current);
    };
  }, [longitude, latitude]);

  return (
    <>
      {markerEl && createPortal(GPS_DOT, markerEl)}
      {popupContainer &&
        createPortal(
          <div className="min-w-40 space-y-1 p-3 text-xs">
            <div className="mb-2 text-sm font-semibold">{t("popup.yourLocation")}</div>
            <div className="font-mono">{formatCoordinates(latitude, longitude, gpsFormat)}</div>
            <div className="flex justify-between gap-4 font-mono">
              <span className="text-muted-foreground">{t("popup.accuracy")}</span>
              <span>±{Math.round(accuracy)} m</span>
            </div>
            <NavigationLinks latitude={latitude} longitude={longitude} displayMode="buttons" className="border-t pt-2" />
          </div>,
          popupContainer,
        )}
    </>
  );
}

type MapControlsProps = {
  /** Position of the controls on the map (default: "bottom-right") */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Show zoom in/out buttons (default: true) */
  showZoom?: boolean;
  /** Show compass button to reset bearing (default: false) */
  showCompass?: boolean;
  /** Show locate button to find user's location (default: false) */
  showLocate?: boolean;
  /** Show fullscreen toggle button (default: false) */
  showFullscreen?: boolean;
  /** Show scale bar (default: false) */
  showScale?: boolean;
  /** Additional CSS classes for the controls container */
  className?: string;
  /** Callback with user coordinates when located */
  onLocate?: (coords: { longitude: number; latitude: number }) => void;
};

const positionClasses = {
  "top-left": "top-2 left-2",
  "top-right": "top-2 right-2",
  "bottom-left": "bottom-2 left-2",
  "bottom-right": "bottom-10 right-2",
};

function ControlGroup({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-md border border-border bg-background shadow-sm overflow-hidden [&>button:not(:last-child)]:border-b [&>button:not(:last-child)]:border-border">
      {children}
    </div>
  );
}

function ControlButton({
  onClick,
  label,
  children,
  disabled = false,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      type="button"
      className={cn(
        "flex items-center justify-center size-8 hover:bg-accent dark:hover:bg-accent/40 transition-colors",
        disabled && "opacity-50 pointer-events-none cursor-not-allowed",
      )}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

function MapControls({
  position = "bottom-right",
  showZoom = true,
  showCompass = false,
  showLocate = false,
  showFullscreen = false,
  showScale = false,
  className,
  onLocate,
}: MapControlsProps) {
  const { map } = useMap();
  const { preferences } = usePreferences();
  const [waitingForLocation, setWaitingForLocation] = useState(false);
  const [userLocation, setUserLocation] = useState<{ longitude: number; latitude: number; accuracy: number } | null>(null);
  const userLocationRef = useRef<{ longitude: number; latitude: number; accuracy: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const [scaleLabel, setScaleLabel] = useState("");
  const [scaleWidth, setScaleWidth] = useState(0);

  useEffect(() => {
    if (!map || !showScale) return;

    const updateScale = () => {
      const maxWidth = 96;
      const y = map.getContainer().clientHeight / 2;
      const left = map.unproject([0, y]);
      const right = map.unproject([maxWidth, y]);
      const distance = left.distanceTo(right);

      const steps = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000];
      const roundedValue = [...steps].reverse().find((s) => s <= distance) ?? steps[0];
      const ratio = roundedValue / distance;

      const label = roundedValue >= 1000 ? `${roundedValue / 1000} km` : `${roundedValue} m`;

      setScaleWidth(Math.round(maxWidth * ratio));
      setScaleLabel(label);
    };

    map.on("moveend", updateScale);
    updateScale();
    return () => {
      map.off("moveend", updateScale);
    };
  }, [map, showScale]);

  const handleZoomIn = useCallback(() => {
    map?.zoomTo(map.getZoom() + 1, { duration: 300 });
  }, [map]);

  const handleZoomOut = useCallback(() => {
    map?.zoomTo(map.getZoom() - 1, { duration: 300 });
  }, [map]);

  const handleResetBearing = useCallback(() => {
    map?.resetNorthPitch({ duration: 300 });
  }, [map]);

  const handleLocate = useCallback(() => {
    if (watchIdRef.current !== null && userLocationRef.current) {
      const loc = userLocationRef.current;
      map?.flyTo({ center: [loc.longitude, loc.latitude], zoom: 14, duration: 1500 });
      return;
    }
    if (!("geolocation" in navigator)) return;
    setWaitingForLocation(true);
    let firstFix = true;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { longitude: pos.coords.longitude, latitude: pos.coords.latitude, accuracy: pos.coords.accuracy };
        userLocationRef.current = coords;
        setUserLocation(coords);
        if (firstFix) {
          firstFix = false;
          setWaitingForLocation(false);
          map?.flyTo({ center: [coords.longitude, coords.latitude], zoom: 14, duration: 1500 });
          onLocate?.(coords);
        }
      },
      (error) => {
        console.error("Error getting location:", error);
        setWaitingForLocation(false);
      },
      { enableHighAccuracy: true },
    );
    watchIdRef.current = watchId;
  }, [map, onLocate]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  const handleFullscreen = useCallback(() => {
    const container = map?.getContainer();
    if (!container) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void container.requestFullscreen();
    }
  }, [map]);

  return (
    <>
      <div className={cn("absolute z-10 flex flex-col gap-1.5", positionClasses[position], className)}>
        {showZoom && (
          <ControlGroup>
            <ControlButton onClick={handleZoomIn} label="Zoom in">
              <HugeiconsIcon icon={PlusSignIcon} className="size-4" />
            </ControlButton>
            <ControlButton onClick={handleZoomOut} label="Zoom out">
              <HugeiconsIcon icon={MinusSignIcon} className="size-4" />
            </ControlButton>
          </ControlGroup>
        )}
        {showCompass && (
          <ControlGroup>
            <CompassButton onClick={handleResetBearing} />
          </ControlGroup>
        )}
        {showLocate && (
          <ControlGroup>
            <ControlButton onClick={handleLocate} label={userLocation ? "Center on my location" : "Find my location"} disabled={waitingForLocation}>
              {waitingForLocation ? (
                <Spinner className="size-4" />
              ) : (
                <HugeiconsIcon icon={Location01Icon} className={cn("size-4", userLocation && "text-blue-500")} />
              )}
            </ControlButton>
          </ControlGroup>
        )}
        {showFullscreen && typeof document !== "undefined" && document.fullscreenEnabled && (
          <ControlGroup>
            <ControlButton onClick={handleFullscreen} label="Toggle fullscreen">
              <HugeiconsIcon icon={MaximizeIcon} className="size-4" />
            </ControlButton>
          </ControlGroup>
        )}
      </div>
      {showScale && scaleLabel && (
        <div className="hidden md:block absolute z-10 bottom-2 left-2">
          <div className="w-29 flex flex-col items-start rounded-md border border-border bg-background shadow-sm px-2 py-1">
            <span className="text-[10px] font-semibold text-foreground leading-tight">{scaleLabel}</span>
            <div className="mt-0.5 border-b-2 border-l-2 border-r-2 border-foreground/60 rounded-b-sm" style={{ width: scaleWidth }} />
          </div>
        </div>
      )}
      {userLocation && (
        <UserLocationMarker
          longitude={userLocation.longitude}
          latitude={userLocation.latitude}
          accuracy={userLocation.accuracy}
          gpsFormat={preferences.gpsFormat}
        />
      )}
    </>
  );
}

function CompassButton({ onClick }: { onClick: () => void }) {
  const { map } = useMap();
  const compassRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!map || !compassRef.current) return;

    const compass = compassRef.current;

    const updateRotation = () => {
      const bearing = map.getBearing();
      const pitch = map.getPitch();
      compass.style.transform = `rotateX(${pitch}deg) rotateZ(${-bearing}deg)`;
    };

    map.on("rotate", updateRotation);
    map.on("pitch", updateRotation);
    updateRotation();

    return () => {
      map.off("rotate", updateRotation);
      map.off("pitch", updateRotation);
    };
  }, [map]);

  return (
    <ControlButton onClick={onClick} label="Reset bearing to north">
      <HugeiconsIcon icon={CompassIcon} className="size-4 transform-gpu transition-transform" ref={compassRef} />
    </ControlButton>
  );
}

type MapStyleSwitcherProps = {
  /** Position of the switcher on the map (default: "bottom-left") */
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Additional CSS classes for the switcher container */
  className?: string;
};

const styleSwitcherPositionClasses = {
  "top-left": "top-2 left-2",
  "top-right": "top-2 right-2",
  "bottom-left": "bottom-20 left-2 md:bottom-2",
  "bottom-right": "bottom-20 right-2 md:bottom-10",
};

function MapStyleSwitcher({ position = "bottom-left", className }: MapStyleSwitcherProps) {
  const { mapStyle, setMapStyle } = useMap();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const styleKeys = Object.keys(mapStyleOptions) as MapStyle[];

  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  return (
    <div ref={containerRef} className={cn("absolute z-10", styleSwitcherPositionClasses[position], className)}>
      {isOpen ? (
        <div className="flex gap-2 p-2 rounded-lg bg-background/90 backdrop-blur-sm border border-border shadow-lg">
          {styleKeys.map((key) => {
            const style = mapStyleOptions[key];
            const isSelected = mapStyle === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setMapStyle(key);
                  setIsOpen(false);
                }}
                className="flex flex-col items-center gap-1 group"
              >
                <div
                  className={cn(
                    "w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors",
                    isSelected ? "border-blue-500" : "border-transparent group-hover:border-muted-foreground/50",
                  )}
                >
                  <img src={style.thumbnail} alt={style.label} className="w-full h-full object-cover" />
                </div>
                <span className={cn("text-xs font-medium", isSelected ? "text-foreground" : "text-muted-foreground")}>{style.label}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-12 h-12 rounded-lg overflow-hidden border-2 border-border bg-background shadow-md hover:border-muted-foreground/50 transition-colors"
          aria-label="Change map style"
        >
          <img src={mapStyleOptions[mapStyle].thumbnail} alt={mapStyleOptions[mapStyle].label} className="w-full h-full object-cover" />
        </button>
      )}
    </div>
  );
}

type MapPopupProps = {
  /** Longitude coordinate for popup position */
  longitude: number;
  /** Latitude coordinate for popup position */
  latitude: number;
  /** Callback when popup is closed */
  onClose?: () => void;
  /** Popup content */
  children: ReactNode;
  /** Additional CSS classes for the popup container */
  className?: string;
  /** Show a close button in the popup (default: false) */
  closeButton?: boolean;
} & Omit<PopupOptions, "className" | "closeButton">;

function MapPopup({
  longitude,
  latitude,
  onClose,
  children,
  className,
  closeButton = false,
  offset: mapPopupOffset,
  maxWidth: mapPopupMaxWidth,
  anchor: mapPopupAnchor,
  closeOnClick: mapPopupCloseOnClick,
  closeOnMove: mapPopupCloseOnMove,
  focusAfterOpen: mapPopupFocusAfterOpen,
}: MapPopupProps) {
  const { map } = useMap();
  const container = useMemo(() => document.createElement("div"), []);

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const popup = useMemo(() => {
    const popupInstance = new MapLibreGL.Popup({
      offset: mapPopupOffset ?? 16,
      maxWidth: mapPopupMaxWidth,
      anchor: mapPopupAnchor,
      closeOnClick: mapPopupCloseOnClick,
      closeOnMove: mapPopupCloseOnMove,
      focusAfterOpen: mapPopupFocusAfterOpen,
      closeButton: false,
    })
      .setMaxWidth("none")
      .setLngLat([longitude, latitude]);

    return popupInstance;
  }, [latitude, longitude, mapPopupOffset, mapPopupMaxWidth, mapPopupAnchor, mapPopupCloseOnClick, mapPopupCloseOnMove, mapPopupFocusAfterOpen]);

  useEffect(() => {
    if (!map) return;

    const onCloseProp = () => onCloseRef.current?.();
    popup.on("close", onCloseProp);

    popup.setDOMContent(container);
    popup.addTo(map);

    return () => {
      popup.off("close", onCloseProp);
      if (popup.isOpen()) {
        popup.remove();
      }
    };
  }, [map, container, popup]);

  useEffect(() => {
    if (!popup.isOpen()) return;
    popup.setLngLat([longitude, latitude]);
    popup.setOffset(mapPopupOffset ?? 16);
    if (mapPopupMaxWidth) popup.setMaxWidth(mapPopupMaxWidth);
  }, [popup, longitude, latitude, mapPopupOffset, mapPopupMaxWidth]);

  const handleClose = () => {
    popup.remove();
  };

  return createPortal(
    <div className={cn("relative rounded-md border bg-popover p-3 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95", className)}>
      {closeButton && (
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-1 right-1 z-10 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          aria-label="Close popup"
        >
          <HugeiconsIcon icon={Cancel01Icon} className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      )}
      {children}
    </div>,
    container,
  );
}

type MapRouteProps = {
  /** Optional unique identifier for the route layer */
  id?: string;
  /** Array of [longitude, latitude] coordinate pairs defining the route */
  coordinates: [number, number][];
  /** Line color as CSS color value (default: "#4285F4") */
  color?: string;
  /** Line width in pixels (default: 3) */
  width?: number;
  /** Line opacity from 0 to 1 (default: 0.8) */
  opacity?: number;
  /** Dash pattern [dash length, gap length] for dashed lines */
  dashArray?: [number, number];
  /** Callback when the route line is clicked */
  onClick?: () => void;
  /** Callback when mouse enters the route line */
  onMouseEnter?: () => void;
  /** Callback when mouse leaves the route line */
  onMouseLeave?: () => void;
  /** Whether the route is interactive - shows pointer cursor on hover (default: true) */
  interactive?: boolean;
};

function MapRoute({
  id: propId,
  coordinates,
  color = "#4285F4",
  width = 3,
  opacity = 0.8,
  dashArray,
  onClick,
  onMouseEnter,
  onMouseLeave,
  interactive = true,
}: MapRouteProps) {
  const { map, isLoaded } = useMap();
  const autoId = useId();
  const id = propId ?? autoId;
  const sourceId = `route-source-${id}`;
  const layerId = `route-layer-${id}`;

  // Add source and layer on mount
  useEffect(() => {
    if (!isLoaded || !map) return;

    map.addSource(sourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [] },
      },
    });

    map.addLayer({
      id: layerId,
      type: "line",
      source: sourceId,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": color,
        "line-width": width,
        "line-opacity": opacity,
        ...(dashArray && { "line-dasharray": dashArray }),
      },
    });

    return () => {
      try {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, map, color, dashArray, layerId, opacity, sourceId, width]);

  // When coordinates change, update the source data
  useEffect(() => {
    if (!isLoaded || !map || coordinates.length < 2) return;

    const source = map.getSource(sourceId) as MapLibreGL.GeoJSONSource;
    if (source) {
      source.setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates },
      });
    }
  }, [isLoaded, map, coordinates, sourceId]);

  useEffect(() => {
    if (!isLoaded || !map || !map.getLayer(layerId)) return;

    map.setPaintProperty(layerId, "line-color", color);
    map.setPaintProperty(layerId, "line-width", width);
    map.setPaintProperty(layerId, "line-opacity", opacity);
    if (dashArray) {
      map.setPaintProperty(layerId, "line-dasharray", dashArray);
    }
  }, [isLoaded, map, layerId, color, width, opacity, dashArray]);

  // Handle click and hover events
  useEffect(() => {
    if (!isLoaded || !map || !interactive) return;

    const handleClick = () => {
      onClick?.();
    };
    const handleMouseEnter = () => {
      map.getCanvas().style.cursor = "pointer";
      onMouseEnter?.();
    };
    const handleMouseLeave = () => {
      map.getCanvas().style.cursor = "";
      onMouseLeave?.();
    };

    const attach = () => {
      map.on("click", layerId, handleClick);
      map.on("mouseenter", layerId, handleMouseEnter);
      map.on("mouseleave", layerId, handleMouseLeave);
    };

    const detach = () => {
      map.off("click", layerId, handleClick);
      map.off("mouseenter", layerId, handleMouseEnter);
      map.off("mouseleave", layerId, handleMouseLeave);
    };

    attach();
    const unsubscribe = onBeforeStyleChange(map, detach);

    return () => {
      detach();
      unsubscribe();
    };
  }, [isLoaded, map, layerId, onClick, onMouseEnter, onMouseLeave, interactive]);

  return null;
}

type MapClusterLayerProps<P extends GeoJSON.GeoJsonProperties = GeoJSON.GeoJsonProperties> = {
  /** GeoJSON FeatureCollection data or URL to fetch GeoJSON from */
  data: string | GeoJSON.FeatureCollection<GeoJSON.Point, P>;
  /** Maximum zoom level to cluster points on (default: 14) */
  clusterMaxZoom?: number;
  /** Radius of each cluster when clustering points in pixels (default: 50) */
  clusterRadius?: number;
  /** Colors for cluster circles: [small, medium, large] based on point count (default: ["#51bbd6", "#f1f075", "#f28cb1"]) */
  clusterColors?: [string, string, string];
  /** Point count thresholds for color/size steps: [medium, large] (default: [100, 750]) */
  clusterThresholds?: [number, number];
  /** Color for unclustered individual points (default: "#3b82f6") */
  pointColor?: string;
  /** Callback when an unclustered point is clicked */
  onPointClick?: (feature: GeoJSON.Feature<GeoJSON.Point, P>, coordinates: [number, number]) => void;
  /** Callback when a cluster is clicked. If not provided, zooms into the cluster */
  onClusterClick?: (clusterId: number, coordinates: [number, number], pointCount: number) => void;
};

function MapClusterLayer<P extends GeoJSON.GeoJsonProperties = GeoJSON.GeoJsonProperties>({
  data,
  clusterMaxZoom = 14,
  clusterRadius = 50,
  clusterColors = ["#22c55e", "#eab308", "#ef4444"],
  clusterThresholds = [100, 750],
  pointColor = "#3b82f6",
  onPointClick,
  onClusterClick,
}: MapClusterLayerProps<P>) {
  const { map, isLoaded } = useMap();
  const id = useId();
  const sourceId = `cluster-source-${id}`;
  const clusterLayerId = `clusters-${id}`;
  const clusterCountLayerId = `cluster-count-${id}`;
  const unclusteredLayerId = `unclustered-point-${id}`;

  const stylePropsRef = useRef({
    clusterColors,
    clusterThresholds,
    pointColor,
  });

  // Add source and layers on mount
  useEffect(() => {
    if (!isLoaded || !map) return;

    // Add clustered GeoJSON source
    map.addSource(sourceId, {
      type: "geojson",
      data,
      cluster: true,
      clusterMaxZoom,
      clusterRadius,
    });

    // Add cluster circles layer
    map.addLayer({
      id: clusterLayerId,
      type: "circle",
      source: sourceId,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": [
          "step",
          ["get", "point_count"],
          clusterColors[0],
          clusterThresholds[0],
          clusterColors[1],
          clusterThresholds[1],
          clusterColors[2],
        ],
        "circle-radius": ["step", ["get", "point_count"], 20, clusterThresholds[0], 30, clusterThresholds[1], 40],
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff",
        "circle-opacity": 0.85,
      },
    });

    // Add cluster count text layer
    map.addLayer({
      id: clusterCountLayerId,
      type: "symbol",
      source: sourceId,
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-size": 12,
      },
      paint: {
        "text-color": "#fff",
      },
    });

    // Add unclustered point layer
    map.addLayer({
      id: unclusteredLayerId,
      type: "circle",
      source: sourceId,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-color": pointColor,
        "circle-radius": 5,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#fff",
      },
    });

    return () => {
      try {
        if (map.getLayer(clusterCountLayerId)) map.removeLayer(clusterCountLayerId);
        if (map.getLayer(unclusteredLayerId)) map.removeLayer(unclusteredLayerId);
        if (map.getLayer(clusterLayerId)) map.removeLayer(clusterLayerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      } catch {
        // ignore
      }
    };
  }, [
    isLoaded,
    map,
    sourceId,
    clusterColors,
    clusterCountLayerId,
    clusterLayerId,
    clusterMaxZoom,
    clusterRadius,
    clusterThresholds,
    data,
    pointColor,
    unclusteredLayerId,
  ]);

  // Update source data when data prop changes (only for non-URL data)
  useEffect(() => {
    if (!isLoaded || !map || typeof data === "string") return;

    const source = map.getSource(sourceId) as MapLibreGL.GeoJSONSource;
    if (source) {
      source.setData(data);
    }
  }, [isLoaded, map, data, sourceId]);

  // Update layer styles when props change
  useEffect(() => {
    if (!isLoaded || !map) return;

    const prev = stylePropsRef.current;
    const colorsChanged = prev.clusterColors !== clusterColors || prev.clusterThresholds !== clusterThresholds;

    // Update cluster layer colors and sizes
    if (map.getLayer(clusterLayerId) && colorsChanged) {
      map.setPaintProperty(clusterLayerId, "circle-color", [
        "step",
        ["get", "point_count"],
        clusterColors[0],
        clusterThresholds[0],
        clusterColors[1],
        clusterThresholds[1],
        clusterColors[2],
      ]);
      map.setPaintProperty(clusterLayerId, "circle-radius", ["step", ["get", "point_count"], 20, clusterThresholds[0], 30, clusterThresholds[1], 40]);
    }

    // Update unclustered point layer color
    if (map.getLayer(unclusteredLayerId) && prev.pointColor !== pointColor) {
      map.setPaintProperty(unclusteredLayerId, "circle-color", pointColor);
    }

    stylePropsRef.current = { clusterColors, clusterThresholds, pointColor };
  }, [isLoaded, map, clusterLayerId, unclusteredLayerId, clusterColors, clusterThresholds, pointColor]);

  // Handle click events
  useEffect(() => {
    if (!isLoaded || !map) return;

    // Cluster click handler - zoom into cluster
    const handleClusterClick = async (
      e: MapLibreGL.MapMouseEvent & {
        features?: MapLibreGL.MapGeoJSONFeature[];
      },
    ) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [clusterLayerId],
      });
      if (!features.length) return;

      const feature = features[0];
      const clusterId = feature.properties?.cluster_id as number;
      const pointCount = feature.properties?.point_count as number;
      const coordinates = (feature.geometry as GeoJSON.Point).coordinates as [number, number];

      if (onClusterClick) {
        onClusterClick(clusterId, coordinates, pointCount);
      } else {
        // Default behavior: zoom to cluster expansion zoom
        const source = map.getSource(sourceId) as MapLibreGL.GeoJSONSource;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({
          center: coordinates,
          zoom,
        });
      }
    };

    // Unclustered point click handler
    const handlePointClick = (
      e: MapLibreGL.MapMouseEvent & {
        features?: MapLibreGL.MapGeoJSONFeature[];
      },
    ) => {
      if (!onPointClick || !e.features?.length) return;

      const feature = e.features[0];
      const coordinates = (feature.geometry as GeoJSON.Point).coordinates.slice() as [number, number];

      // Handle world copies
      while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
        coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360;
      }

      onPointClick(feature as unknown as GeoJSON.Feature<GeoJSON.Point, P>, coordinates);
    };

    // Cursor style handlers
    const handleMouseEnterCluster = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleMouseLeaveCluster = () => {
      map.getCanvas().style.cursor = "";
    };
    const handleMouseEnterPoint = () => {
      if (onPointClick) {
        map.getCanvas().style.cursor = "pointer";
      }
    };
    const handleMouseLeavePoint = () => {
      map.getCanvas().style.cursor = "";
    };

    const attach = () => {
      map.on("click", clusterLayerId, handleClusterClick);
      map.on("click", unclusteredLayerId, handlePointClick);
      map.on("mouseenter", clusterLayerId, handleMouseEnterCluster);
      map.on("mouseleave", clusterLayerId, handleMouseLeaveCluster);
      map.on("mouseenter", unclusteredLayerId, handleMouseEnterPoint);
      map.on("mouseleave", unclusteredLayerId, handleMouseLeavePoint);
    };

    const detach = () => {
      map.off("click", clusterLayerId, handleClusterClick);
      map.off("click", unclusteredLayerId, handlePointClick);
      map.off("mouseenter", clusterLayerId, handleMouseEnterCluster);
      map.off("mouseleave", clusterLayerId, handleMouseLeaveCluster);
      map.off("mouseenter", unclusteredLayerId, handleMouseEnterPoint);
      map.off("mouseleave", unclusteredLayerId, handleMouseLeavePoint);
    };

    attach();
    const unsubscribe = onBeforeStyleChange(map, detach);

    return () => {
      detach();
      unsubscribe();
    };
  }, [isLoaded, map, clusterLayerId, unclusteredLayerId, sourceId, onClusterClick, onPointClick]);

  return null;
}

export {
  MapComponent as Map,
  useMap,
  useResolvedTheme,
  onBeforeStyleChange,
  MapMarker,
  MarkerContent,
  MarkerPopup,
  MarkerTooltip,
  MarkerLabel,
  MapPopup,
  MapControls,
  MapStyleSwitcher,
  MapRoute,
  MapClusterLayer,
};

export type { MapRef, MapStyle, Theme };
