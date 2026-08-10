import { Cancel01Icon, Delete02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { GeoJSONSource, MapMouseEvent, MapTouchEvent } from "maplibre-gl";
import { type ReactNode, useCallback, useEffect, useEffectEvent, useReducer, useRef } from "react";

import { onBeforeStyleChange, useMap } from "@/components/ui/map";
import { Separator } from "@/components/ui/separator";
import { usePreferences } from "@/hooks/usePreferences";
import { formatCoordinates } from "@/lib/gpsUtils";
import { cn } from "@/lib/utils";

import { calculateBearing, calculateDistance, calculateTA } from "../utils";

const EMPTY_FC = { type: "FeatureCollection", features: [] };
type GeoJsonSourceData = Parameters<GeoJSONSource["setData"]>[0];

function safeSetData(source: GeoJSONSource | null, data: object) {
  try {
    void source?.setData(data as unknown as GeoJsonSourceData);
  } catch {}
}

type SavedMeasurement = {
  marker: CursorPosition;
  cursor: CursorPosition;
};

type CursorPosition = { lat: number; lng: number };
type ActiveMarker = { latitude: number; longitude: number };

type MeasurementMetrics = {
  ref: CursorPosition;
  dist: string;
  bearing: number;
  ta: ReturnType<typeof calculateTA>;
};

type MeasurementState = {
  cursor: CursorPosition | null;
  lastSaved: SavedMeasurement | null;
};

type MeasurementAction =
  | { type: "cursorInitialized"; cursor: CursorPosition }
  | { type: "cursorMoved"; cursor: CursorPosition }
  | { type: "measurementSaved"; measurement: SavedMeasurement }
  | { type: "savedMeasurementsCleared" };

const INITIAL_MEASUREMENT_STATE: MeasurementState = {
  cursor: null,
  lastSaved: null,
};

function measurementReducer(state: MeasurementState, action: MeasurementAction): MeasurementState {
  switch (action.type) {
    case "cursorInitialized":
      if (state.cursor) return state;
      return { ...state, cursor: action.cursor };
    case "cursorMoved":
      return { ...state, cursor: action.cursor };
    case "measurementSaved":
      return { ...state, lastSaved: action.measurement };
    case "savedMeasurementsCleared":
      return { ...state, lastSaved: null };
  }
}

function generateCirclePolygon(lat: number, lng: number, radiusMeters: number) {
  const R = 6371000;
  const numPoints = 256;
  const δ = radiusMeters / R;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lng * Math.PI) / 180;
  const coords: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const bearing = (i / numPoints) * 2 * Math.PI;
    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(bearing));
    const λ2 = λ1 + Math.atan2(Math.sin(bearing) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
    coords.push([(λ2 * 180) / Math.PI, (φ2 * 180) / Math.PI]);
  }
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coords] } };
}

type MapCursorInfoProps = {
  activeMarker?: ActiveMarker | null;
  onActiveMarkerClear?: () => void;
  className?: string;
  variant?: "desktop" | "mobile";
};

type MobileMeasureButtonProps = {
  children: ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

function MobileMeasureButton({ children, label, onClick, disabled = false }: MobileMeasureButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 min-w-8 flex-1 items-center justify-center border-r border-border/50 text-muted-foreground transition-colors last:border-r-0 hover:bg-muted/70 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function MobileMetric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[8px] font-bold uppercase leading-none text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-[11px] font-bold leading-none tabular-nums text-foreground">{value}</div>
    </div>
  );
}

export function MapCursorInfo({ activeMarker, onActiveMarkerClear, className, variant = "desktop" }: MapCursorInfoProps) {
  const { map, isLoaded } = useMap();
  const { preferences } = usePreferences();
  const [{ cursor, lastSaved }, dispatch] = useReducer(measurementReducer, INITIAL_MEASUREMENT_STATE);

  const activeMarkerRef = useRef(activeMarker);
  const circleEnabledRef = useRef(preferences.mapMeasureCircle);
  const circleVisibleRef = useRef(true);
  const cursorRef = useRef<CursorPosition | null>(null);
  const lineSourceRef = useRef<GeoJSONSource | null>(null);
  const circleSourceRef = useRef<GeoJSONSource | null>(null);
  const savedLineSourceRef = useRef<GeoJSONSource | null>(null);
  const savedCircleSourceRef = useRef<GeoJSONSource | null>(null);
  const savedMeasurementsRef = useRef<SavedMeasurement[]>([]);
  const sourcesPopulated = useRef(false);
  const rafRef = useRef<number | null>(null);

  const clearSourceRefs = useCallback(() => {
    lineSourceRef.current = null;
    circleSourceRef.current = null;
    savedLineSourceRef.current = null;
    savedCircleSourceRef.current = null;
    sourcesPopulated.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    activeMarkerRef.current = activeMarker;
  }, [activeMarker]);
  useEffect(() => {
    circleEnabledRef.current = preferences.mapMeasureCircle;
    if (preferences.mapMeasureCircle) circleVisibleRef.current = true;
  }, [preferences.mapMeasureCircle]);

  const markerLat = activeMarker?.latitude ?? null;
  const markerLng = activeMarker?.longitude ?? null;
  const circleEnabled = preferences.mapMeasureCircle;

  const updateSavedSources = useCallback(() => {
    const measurements = savedMeasurementsRef.current;
    safeSetData(savedLineSourceRef.current, {
      type: "FeatureCollection",
      features: measurements.map(({ marker, cursor }) => ({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [marker.lng, marker.lat],
            [cursor.lng, cursor.lat],
          ],
        },
      })),
    });
    safeSetData(
      savedCircleSourceRef.current,
      circleEnabledRef.current && circleVisibleRef.current
        ? {
            type: "FeatureCollection",
            features: measurements.map(({ marker, cursor }) =>
              generateCirclePolygon(marker.lat, marker.lng, calculateDistance(marker.lat, marker.lng, cursor.lat, cursor.lng)),
            ),
          }
        : EMPTY_FC,
    );
  }, []);

  const updateLiveSources = useCallback((marker: ActiveMarker | null | undefined, nextCursor: CursorPosition | null) => {
    if (marker && nextCursor) {
      sourcesPopulated.current = true;
      safeSetData(lineSourceRef.current, {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: [
            [marker.longitude, marker.latitude],
            [nextCursor.lng, nextCursor.lat],
          ],
        },
      });
      if (circleEnabledRef.current && circleVisibleRef.current) {
        const radius = calculateDistance(marker.latitude, marker.longitude, nextCursor.lat, nextCursor.lng);
        safeSetData(circleSourceRef.current, generateCirclePolygon(marker.latitude, marker.longitude, radius));
      } else safeSetData(circleSourceRef.current, EMPTY_FC);
    } else if (sourcesPopulated.current) {
      sourcesPopulated.current = false;
      safeSetData(lineSourceRef.current, EMPTY_FC);
      safeSetData(circleSourceRef.current, EMPTY_FC);
    }
  }, []);

  const updateCursorPosition = useCallback(
    (lat: number, lng: number) => {
      const nextCursor = { lat, lng };
      cursorRef.current = nextCursor;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        dispatch({ type: "cursorMoved", cursor: nextCursor });
      });
      updateLiveSources(activeMarkerRef.current, nextCursor);
    },
    [updateLiveSources],
  );

  const saveCurrentMeasurement = useCallback(() => {
    const marker = activeMarkerRef.current;
    const currentCursor = cursorRef.current;
    if (!marker || !currentCursor) return;
    const measurement = { marker: { lat: marker.latitude, lng: marker.longitude }, cursor: currentCursor };
    savedMeasurementsRef.current = [...savedMeasurementsRef.current, measurement];
    updateSavedSources();
    dispatch({ type: "measurementSaved", measurement });
    onActiveMarkerClear?.();
  }, [updateSavedSources, onActiveMarkerClear]);

  const clearSavedMeasurements = useCallback(() => {
    savedMeasurementsRef.current = [];
    updateSavedSources();
    dispatch({ type: "savedMeasurementsCleared" });
  }, [updateSavedSources]);

  const toggleCircleVisibility = useCallback(() => {
    if (!circleEnabledRef.current) return;
    (document.activeElement as HTMLElement | null)?.blur();
    circleVisibleRef.current = !circleVisibleRef.current;
    updateSavedSources();
    updateLiveSources(activeMarkerRef.current, cursorRef.current);
  }, [updateSavedSources, updateLiveSources]);

  const handleKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === " ") {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      e.preventDefault();
      saveCurrentMeasurement();
    } else if (e.key?.toLowerCase() === "c") {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      toggleCircleVisibility();
    } else if (e.key === "Escape") {
      clearSavedMeasurements();
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!map) return;
    return onBeforeStyleChange(map, clearSourceRefs);
  }, [map, clearSourceRefs]);

  useEffect(() => {
    if (!map || !isLoaded) return;
    try {
      if (!map.getSource("cursor-measure-line")) {
        map.addSource("cursor-measure-line", { type: "geojson", data: EMPTY_FC });
      }
      lineSourceRef.current = map.getSource("cursor-measure-line") as GeoJSONSource;

      if (!map.getLayer("cursor-measure-line")) {
        map.addLayer({
          id: "cursor-measure-line",
          type: "line",
          source: "cursor-measure-line",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#f59f0b", "line-width": 2, "line-dasharray": [2, 1] },
        });
      }
    } catch {}

    return () => {
      clearSourceRefs();
      try {
        if (map.getStyle() === undefined) return;
        if (map.getLayer("cursor-measure-line")) map.removeLayer("cursor-measure-line");
        if (map.getSource("cursor-measure-line")) map.removeSource("cursor-measure-line");
      } catch {}
    };
  }, [map, isLoaded, clearSourceRefs]);

  useEffect(() => {
    if (!map || !isLoaded) return;

    try {
      if (!map.getSource("cursor-measure-circle")) {
        map.addSource("cursor-measure-circle", { type: "geojson", data: EMPTY_FC });
      }
      circleSourceRef.current = map.getSource("cursor-measure-circle") as GeoJSONSource;

      if (!map.getLayer("cursor-measure-circle-fill")) {
        map.addLayer({
          id: "cursor-measure-circle-fill",
          type: "fill",
          source: "cursor-measure-circle",
          paint: { "fill-color": "#f59f0b", "fill-opacity": 0.08 },
        });
      }

      if (!map.getLayer("cursor-measure-circle-line")) {
        map.addLayer({
          id: "cursor-measure-circle-line",
          type: "line",
          source: "cursor-measure-circle",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#f59f0b", "line-width": 2 },
        });
      }
    } catch {}

    return () => {
      clearSourceRefs();
      try {
        if (map.getStyle() === undefined) return;
        if (map.getLayer("cursor-measure-circle-line")) map.removeLayer("cursor-measure-circle-line");
        if (map.getLayer("cursor-measure-circle-fill")) map.removeLayer("cursor-measure-circle-fill");
        if (map.getSource("cursor-measure-circle")) map.removeSource("cursor-measure-circle");
      } catch {}
    };
  }, [map, isLoaded, clearSourceRefs]);

  useEffect(() => {
    if (!map || !isLoaded) return;
    try {
      if (!map.getSource("saved-measure-lines")) {
        map.addSource("saved-measure-lines", { type: "geojson", data: EMPTY_FC });
      }
      savedLineSourceRef.current = map.getSource("saved-measure-lines") as GeoJSONSource;
      if (!map.getLayer("saved-measure-lines")) {
        map.addLayer({
          id: "saved-measure-lines",
          type: "line",
          source: "saved-measure-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#f59f0b", "line-width": 2 },
        });
      }
      updateSavedSources();
    } catch {}
    return () => {
      clearSourceRefs();
      try {
        if (map.getStyle() === undefined) return;
        if (map.getLayer("saved-measure-lines")) map.removeLayer("saved-measure-lines");
        if (map.getSource("saved-measure-lines")) map.removeSource("saved-measure-lines");
      } catch {}
    };
  }, [map, isLoaded, clearSourceRefs, updateSavedSources]);

  useEffect(() => {
    if (!map || !isLoaded) return;
    try {
      if (!map.getSource("saved-measure-circles")) {
        map.addSource("saved-measure-circles", { type: "geojson", data: EMPTY_FC });
      }
      savedCircleSourceRef.current = map.getSource("saved-measure-circles") as GeoJSONSource;
      if (!map.getLayer("saved-measure-circles-fill")) {
        map.addLayer({
          id: "saved-measure-circles-fill",
          type: "fill",
          source: "saved-measure-circles",
          paint: { "fill-color": "#f59f0b", "fill-opacity": 0.12 },
        });
      }
      if (!map.getLayer("saved-measure-circles-line")) {
        map.addLayer({
          id: "saved-measure-circles-line",
          type: "line",
          source: "saved-measure-circles",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#f59f0b", "line-width": 2 },
        });
      }
      updateSavedSources();
    } catch {}
    return () => {
      clearSourceRefs();
      try {
        if (map.getStyle() === undefined) return;
        if (map.getLayer("saved-measure-circles-line")) map.removeLayer("saved-measure-circles-line");
        if (map.getLayer("saved-measure-circles-fill")) map.removeLayer("saved-measure-circles-fill");
        if (map.getSource("saved-measure-circles")) map.removeSource("saved-measure-circles");
      } catch {}
    };
  }, [map, isLoaded, clearSourceRefs, updateSavedSources]);

  useEffect(() => {
    if (!map || !isLoaded) return;

    const onMouseMove = (e: MapMouseEvent) => {
      updateCursorPosition(e.lngLat.lat, e.lngLat.lng);
    };

    const onTouchMove = (e: MapTouchEvent) => {
      updateCursorPosition(e.lngLat.lat, e.lngLat.lng);
    };

    map.on("mousemove", onMouseMove);
    map.on("touchmove", onTouchMove);
    queueMicrotask(() => {
      const center = map.getCenter();
      const initialCursor = cursorRef.current ?? { lat: center.lat, lng: center.lng };
      cursorRef.current = initialCursor;
      dispatch({ type: "cursorInitialized", cursor: initialCursor });
    });

    return () => {
      map.off("mousemove", onMouseMove);
      map.off("touchmove", onTouchMove);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [map, isLoaded, updateCursorPosition]);

  useEffect(() => {
    if (!map || !isLoaded) return;
    const cursor = cursorRef.current;

    updateLiveSources(markerLat !== null && markerLng !== null ? { latitude: markerLat, longitude: markerLng } : null, cursor);
  }, [map, isLoaded, markerLat, markerLng, circleEnabled, updateLiveSources]);

  const metricsMarker = activeMarker ? { lat: activeMarker.latitude, lng: activeMarker.longitude } : (lastSaved?.marker ?? null);
  const metricsCursor = activeMarker ? cursor : (lastSaved?.cursor ?? null);

  let metrics: MeasurementMetrics | null = null;
  if (metricsMarker && metricsCursor) {
    const distMeters = calculateDistance(metricsMarker.lat, metricsMarker.lng, metricsCursor.lat, metricsCursor.lng);
    const bearing = calculateBearing(metricsMarker.lat, metricsMarker.lng, metricsCursor.lat, metricsCursor.lng);
    const ta = calculateTA(distMeters);

    metrics = {
      ref: metricsMarker,
      dist: distMeters > 1000 ? `${(distMeters / 1000).toFixed(2)} km` : `${Math.round(distMeters)} m`,
      bearing: Math.round(bearing),
      ta,
    };
  }

  if (variant === "mobile") {
    if (!activeMarker && !lastSaved) return null;

    return (
      <div className={cn("pointer-events-auto max-w-[calc(100vw-2rem)] select-none md:hidden", className)}>
        <div className="overflow-hidden rounded-lg border bg-background/95 shadow-lg backdrop-blur-md">
          <div className="grid min-w-56 grid-cols-2 gap-x-3 gap-y-2 px-2.5 py-2">
            <MobileMetric label="GPS" value={cursor ? formatCoordinates(cursor.lat, cursor.lng, preferences.gpsFormat) : "0.00000, 0.00000"} />
            <MobileMetric label="REF" value={metrics ? formatCoordinates(metrics.ref.lat, metrics.ref.lng, preferences.gpsFormat) : "-"} />
            <MobileMetric label="Dist" value={metrics ? metrics.dist : "-"} />
            <MobileMetric label="Azm" value={metrics ? `${metrics.bearing}°` : "-"} />
          </div>
          <div className="flex border-t bg-muted/30">
            {activeMarker ? (
              <>
                <MobileMeasureButton label="Save measurement" onClick={saveCurrentMeasurement} disabled={!cursor}>
                  <HugeiconsIcon icon={Tick02Icon} className="size-3.5" />
                </MobileMeasureButton>
                <MobileMeasureButton label="Clear measurement" onClick={() => onActiveMarkerClear?.()}>
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                </MobileMeasureButton>
              </>
            ) : null}
            {lastSaved ? (
              <MobileMeasureButton label="Clear saved measurements" onClick={clearSavedMeasurements}>
                <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
              </MobileMeasureButton>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("select-none invisible md:visible", className)}>
      <div className="flex items-stretch shadow-xl rounded-lg overflow-hidden border bg-background/95 backdrop-blur-md">
        <div className="px-2.5 py-1.5 flex items-center gap-2 border-r border-border/50">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider leading-none">GPS</span>
            <span className="text-xs font-mono font-bold tabular-nums text-foreground leading-none">
              {cursor ? formatCoordinates(cursor.lat, cursor.lng, preferences.gpsFormat) : "0.00000, 0.00000"}
            </span>
          </div>
        </div>

        {metrics ? (
          <div className="bg-muted/30 px-2.5 py-1.5 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] uppercase font-bold text-muted-foreground leading-none">REF</span>
              <span className="text-xs font-mono font-bold tabular-nums text-foreground leading-none">
                {formatCoordinates(metrics.ref.lat, metrics.ref.lng, preferences.gpsFormat)}
              </span>
            </div>

            <div className="w-px h-3 bg-border/60" />

            <div className="flex items-center gap-1.5">
              <span className="text-[8px] uppercase font-bold text-muted-foreground leading-none">Dist</span>
              <span className="text-xs font-mono font-bold tabular-nums text-foreground leading-none">{metrics.dist}</span>
            </div>

            <div className="w-px h-3 bg-border/60" />

            <div className="flex items-center gap-1.5">
              <span className="text-[8px] uppercase font-bold text-muted-foreground leading-none">Azm</span>
              <span className="text-xs font-mono font-bold tabular-nums text-foreground leading-none">{metrics.bearing}°</span>
            </div>

            <div className="w-px h-3 bg-border/60" />

            <div className="flex items-center gap-1.5">
              <span className="text-[8px] uppercase font-bold text-muted-foreground leading-none">TA</span>
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold tabular-nums text-foreground leading-none">
                <span className="flex items-center gap-0.5" title="GSM Timing Advance">
                  <span className="text-[8px] text-muted-foreground/70">GSM</span>
                  {metrics.ta.gsm}
                </span>
                <Separator orientation="vertical" className="h-3 bg-border/50" />
                <span className="flex items-center gap-0.5" title="UMTS Chips (One-way)">
                  <span className="text-[8px] text-muted-foreground/70">UMTS</span>
                  {metrics.ta.umts}
                </span>
                <Separator orientation="vertical" className="h-3 bg-border/50" />
                <span className="flex items-center gap-0.5" title="LTE Timing Advance">
                  <span className="text-[8px] text-muted-foreground/70">LTE</span>
                  {metrics.ta.lte}
                </span>
                <Separator orientation="vertical" className="h-3 bg-border/50" />
                <span className="flex items-center gap-0.5" title="NR Timing Advance (SCS 30kHz)">
                  <span className="text-[8px] text-muted-foreground/70">NR</span>
                  {metrics.ta.nr}
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
