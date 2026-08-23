import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { StationFilters, StationSource, StationStatus } from "@/types/station";

type UseUrlSyncArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  filters: StationFilters;
  onInitialize: (data: {
    filters?: StationFilters;
    center?: [number, number];
    zoom?: number;
    stationId?: string;
    locationId?: number;
    radiolineId?: number;
  }) => void;
};

const LEGACY_FILTER_PARAM_KEYS = ["operators", "bands", "rat", "status", "source", "new", "radiolines", "stations", "rl_operators", "heatmap"];
const STATION_STATUS_URL_CODES: Record<StationStatus, string> = {
  published: "p",
  pending: "n",
  inactive: "i",
};
const STATION_STATUS_BY_URL_CODE = new Map<string, StationStatus>([
  ["p", "published"],
  ["n", "pending"],
  ["i", "inactive"],
]);

function decodeStationStatusUrlToken(value: string): StationStatus | null {
  return STATION_STATUS_BY_URL_CODE.get(value.toLowerCase()) ?? null;
}

function parseLegacyFilters(params: URLSearchParams): Partial<StationFilters> | null {
  if (!LEGACY_FILTER_PARAM_KEYS.some((key) => params.has(key))) return null;

  const operators =
    params
      .get("operators")
      ?.split(",")
      .map(Number)
      .filter((n) => !Number.isNaN(n)) || [];
  const bands =
    params
      .get("bands")
      ?.split(",")
      .map(Number)
      .filter((n) => !Number.isNaN(n)) || [];
  const rat = params.get("rat")?.split(",").filter(Boolean) || [];
  const status = params
    .get("status")
    ?.split(",")
    .map(decodeStationStatusUrlToken)
    .filter((value): value is StationStatus => value !== null) ?? ["published"];
  const source: StationSource = params.get("source") === "uke" ? "uke" : "internal";
  const newParam = params.get("new");
  let recentDays: number | null = null;
  if (newParam === "true") recentDays = 30;
  else if (newParam) recentDays = Math.min(30, Math.max(1, Number(newParam))) || null;
  const showRadiolines = params.get("radiolines") === "1";
  const showStations = params.get("stations") !== "0";
  const radiolineOperators =
    params
      .get("rl_operators")
      ?.split(",")
      .map(Number)
      .filter((n) => !Number.isNaN(n)) || [];
  const showHeatmap = params.get("heatmap") === "1";

  return {
    operators,
    bands,
    rat,
    status,
    source,
    recentDays,
    recentDateFields: ["createdAt"] as ("createdAt" | "updatedAt")[],
    showStations,
    showRadiolines,
    radiolineOperators,
    showHeatmap,
  };
}

function parseTokenFilters(tokens: string[]): Partial<StationFilters> | null {
  if (tokens.length === 0) return null;

  let operators: number[] = [];
  let bands: number[] = [];
  let rat: string[] = [];
  let status: StationStatus[] = ["published"];
  let recentDays: number | null = null;
  let recentDateFields: ("createdAt" | "updatedAt")[] = ["createdAt"];
  let showRadiolines = false;
  let showStations = true;
  let showHeatmap = false;
  let showPlannedMeasurements = false;
  let source: StationSource = "internal";
  let radiolineOperators: number[] = [];

  for (const token of tokens) {
    const key = token[0];
    const value = token.slice(1);
    switch (key) {
      case "o":
        operators = value
          .split(",")
          .map(Number)
          .filter((n) => !Number.isNaN(n));
        break;
      case "b":
        bands = value
          .split(",")
          .map(Number)
          .filter((n) => !Number.isNaN(n));
        break;
      case "r":
        rat = value.split(",").filter(Boolean);
        break;
      case "t":
        status = value
          .split(",")
          .map(decodeStationStatusUrlToken)
          .filter((entry): entry is StationStatus => entry !== null);
        break;
      case "n": {
        const numPart = value.replace(/[^0-9]/g, "");
        const fieldPart = value.replace(/[0-9]/g, "");
        recentDays = Math.min(30, Math.max(1, Number(numPart))) || null;
        if (fieldPart) {
          const fields: ("createdAt" | "updatedAt")[] = [];
          if (fieldPart.includes("c")) fields.push("createdAt");
          if (fieldPart.includes("u")) fields.push("updatedAt");
          if (fieldPart.length) recentDateFields = fields;
        }
        break;
      }
      case "p":
        radiolineOperators = value
          .split(",")
          .map(Number)
          .filter((n) => !Number.isNaN(n));
        break;
      case "f":
        showRadiolines = value.includes("r");
        showHeatmap = value.includes("h");
        showStations = !value.includes("s");
        source = value.includes("u") ? "uke" : "internal";
        showPlannedMeasurements = value.includes("p");
        break;
    }
  }

  return {
    operators,
    bands,
    rat,
    status,
    source,
    recentDays,
    recentDateFields,
    showStations,
    showRadiolines,
    radiolineOperators,
    showHeatmap,
    showPlannedMeasurements,
  };
}

function parseUrlHash(): {
  filters: Partial<StationFilters> | null;
  center?: [number, number];
  zoom?: number;
  stationId?: string;
  locationId?: number;
  radiolineId?: number;
} {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!hash.startsWith("map=")) return { filters: null };

  const hasTokens = hash.includes("~");
  const hasQuery = hash.includes("?");

  const mapSegment = hash.split(hasTokens ? "~" : "?")[0];
  const mapValue = mapSegment.replace("map=", "");
  const [zStr, latStr, lngStr] = mapValue.split("/");

  const z = Number.parseFloat(zStr || "");
  const lat = Number.parseFloat(latStr || "");
  const lng = Number.parseFloat(lngStr || "");

  let filters: Partial<StationFilters> | null = null;
  let stationId: string | undefined;
  let locationId: number | undefined;
  let radiolineId: number | undefined;

  if (hasTokens) {
    const tokens = hash.split("~").slice(1);
    for (const token of tokens) {
      const key = token[0];
      const value = token.slice(1);
      if (key === "L") locationId = Number.parseInt(value, 10) || undefined;
      else if (key === "R") radiolineId = Number.parseInt(value, 10) || undefined;
      else if (key === "S") stationId = value || undefined;
    }
    filters = parseTokenFilters(tokens.filter((t) => t[0] !== "L" && t[0] !== "R" && t[0] !== "S"));
  } else if (hasQuery) {
    const queryPart = hash.split("?")[1] ?? "";
    const params = new URLSearchParams(queryPart);
    filters = parseLegacyFilters(params);
    stationId = params.get("station") || undefined;
    const locationIdStr = params.get("location");
    locationId = locationIdStr ? Number.parseInt(locationIdStr, 10) : undefined;
    const radiolineIdStr = params.get("radioline");
    radiolineId = radiolineIdStr ? Number.parseInt(radiolineIdStr, 10) : undefined;
  }

  return {
    filters,
    center: !Number.isNaN(lat) && !Number.isNaN(lng) ? [lng, lat] : undefined,
    zoom: !Number.isNaN(z) ? z : undefined,
    stationId,
    locationId: locationId !== undefined && !Number.isNaN(locationId) ? locationId : undefined,
    radiolineId: radiolineId !== undefined && !Number.isNaN(radiolineId) ? radiolineId : undefined,
  };
}

function buildUrlHash(filters: StationFilters, map: MapLibreMap, zoomOverride?: number): string {
  const tokens: string[] = [];

  if (filters.operators.length > 0) tokens.push(`o${filters.operators.join(",")}`);
  if (filters.bands.length > 0) tokens.push(`b${filters.bands.join(",")}`);
  if (filters.rat.length > 0) tokens.push(`r${filters.rat.join(",")}`);
  if (!(filters.status.length === 1 && filters.status.includes("published")))
    tokens.push(`t${filters.status.map((status) => STATION_STATUS_URL_CODES[status]).join(",")}`);
  if (filters.recentDays !== null) {
    const fields = filters.recentDateFields.map((field) => (field === "createdAt" ? "c" : "u")).join("");
    const suffix = fields === "c" ? "" : fields;
    tokens.push(`n${filters.recentDays}${suffix}`);
  }

  const flags = [
    filters.showRadiolines && "r",
    filters.showHeatmap && "h",
    filters.showPlannedMeasurements && "p",
    !filters.showStations && "s",
    filters.source === "uke" && "u",
  ]
    .filter(Boolean)
    .join("");
  if (flags) tokens.push(`f${flags}`);

  if (filters.showRadiolines && filters.radiolineOperators.length > 0) tokens.push(`p${filters.radiolineOperators.join(",")}`);

  const center = map.getCenter();
  const zoom = zoomOverride ?? map.getZoom();
  const mapPart = `map=${zoom.toFixed(2)}/${center.lat.toFixed(6)}/${center.lng.toFixed(6)}`;

  return `#${mapPart}${tokens.length > 0 ? `~${tokens.join("~")}` : ""}`;
}

function replaceMapHash(pathname: string, hash: string) {
  if (window.location.pathname !== pathname) return;

  const newUrl = `${pathname}${window.location.search}${hash}`;
  window.history.replaceState(window.history.state, "", newUrl);
}

export function useUrlSync({ map, isLoaded, filters, onInitialize }: UseUrlSyncArgs) {
  const isInitialized = useRef(false);
  const pathname = useRef(window.location.pathname);
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    if (!isLoaded || !map || isInitialized.current) return;

    const { filters: urlFilters, center, zoom: urlZoom, stationId, locationId, radiolineId } = parseUrlHash();

    if (center || urlZoom !== undefined) {
      map.flyTo({
        center: center ?? map.getCenter(),
        zoom: urlZoom ?? map.getZoom(),
        essential: true,
        speed: 1.5,
      });
    }

    onInitialize({
      filters: urlFilters
        ? {
            operators: urlFilters.operators || [],
            bands: urlFilters.bands || [],
            rat: urlFilters.rat || [],
            status: urlFilters.status ?? ["published"],
            source: urlFilters.source || "internal",
            recentDays: urlFilters.recentDays ?? null,
            recentDateFields: urlFilters.recentDateFields ?? ["createdAt"],
            showStations: urlFilters.showStations ?? true,
            showRadiolines: urlFilters.showRadiolines ?? false,
            radiolineOperators: urlFilters.radiolineOperators || [],
            showHeatmap: urlFilters.showHeatmap ?? false,
            showPlannedMeasurements: urlFilters.showPlannedMeasurements ?? false,
          }
        : undefined,
      center,
      zoom: urlZoom,
      stationId,
      locationId,
      radiolineId,
    });

    isInitialized.current = true;
  }, [isLoaded, map, onInitialize]);

  useEffect(() => {
    if (!isLoaded || !map) return;

    const handleMoveEnd = () => {
      if (!isInitialized.current) return;
      replaceMapHash(pathname.current, buildUrlHash(filtersRef.current, map));
    };

    map.on("moveend", handleMoveEnd);
    return () => {
      map.off("moveend", handleMoveEnd);
    };
  }, [isLoaded, map]);

  useEffect(() => {
    if (!isLoaded || !map || !isInitialized.current) return;

    replaceMapHash(pathname.current, buildUrlHash(filters, map));
  }, [filters, isLoaded, map]);
}
