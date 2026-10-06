import { useQueryClient } from "@tanstack/react-query";
import type { Map as MapLibreMap } from "maplibre-gl";
import { useEffect, useEffectEvent, useRef } from "react";

import {
  DEFAULT_MAP_FILTERS,
  DEFAULT_RECENT_DAYS,
  type MapFilters,
  type MapRecentDateField,
  clampRecentDays,
  isDefaultMapStatus,
  sanitizeMapFilters,
} from "../data/mapFilters";
import { findOperatorIdsByMncs } from "../data/mapLookups";
import { operatorsQueryOptions } from "@/features/shared/lookups";
import { isUplinkType } from "@/lib/format/uplink";
import type { StationStatus } from "@/types/station";

export type UrlInitialization = {
  filters?: MapFilters;
  center?: [number, number];
  zoom?: number;
  stationId?: string;
  ukeStationId?: number;
  locationId?: number;
  radiolineId?: number;
};

type UseUrlSyncArgs = {
  map: MapLibreMap | null;
  isLoaded: boolean;
  filters: MapFilters;
  enabled?: boolean;
  onInitialize: (data: UrlInitialization) => void;
};

type UrlFilters = {
  filters: MapFilters;
  legacyOperatorMncs: number[];
};

type ParsedUrlHash = Omit<UrlInitialization, "filters"> & {
  urlFilters: UrlFilters | null;
};

const LEGACY_FILTER_PARAM_KEYS = ["operators", "bands", "rat", "status", "source", "new", "radiolines", "stations", "rl_operators", "heatmap"];
const TARGET_TOKEN_KEYS: ReadonlySet<string> = new Set(["L", "R", "S", "U"]);
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

function parseNumberList(value: string | null): number[] {
  if (!value) return [];
  return value
    .split(",")
    .filter((entry) => entry !== "")
    .map(Number)
    .filter((entry) => !Number.isNaN(entry));
}

function parseStatusList(value: string): StationStatus[] {
  return value
    .split(",")
    .map(decodeStationStatusUrlToken)
    .filter((entry): entry is StationStatus => entry !== null);
}

function parseLegacyFilters(params: URLSearchParams): UrlFilters | null {
  if (!LEGACY_FILTER_PARAM_KEYS.some((key) => params.has(key))) return null;

  const statusParam = params.get("status");
  const newParam = params.get("new");
  let recentDays: number | null = null;
  if (newParam === "true") recentDays = DEFAULT_RECENT_DAYS;
  else if (newParam) recentDays = clampRecentDays(Number(newParam));

  const filters = sanitizeMapFilters({
    ...DEFAULT_MAP_FILTERS,
    bands: parseNumberList(params.get("bands")),
    rat: params.get("rat")?.split(",").filter(Boolean) ?? [],
    status: statusParam === null ? DEFAULT_MAP_FILTERS.status : parseStatusList(statusParam),
    source: params.get("source") === "uke" ? "uke" : "internal",
    recentDays,
    showStations: params.get("stations") !== "0",
    showRadiolines: params.get("radiolines") === "1",
    radiolineOperators: parseNumberList(params.get("rl_operators")),
    showHeatmap: params.get("heatmap") === "1",
  });

  return { filters, legacyOperatorMncs: parseNumberList(params.get("operators")) };
}

function parseRecentToken(value: string): Pick<MapFilters, "recentDays" | "recentDateFields"> {
  const days = value.replace(/[^0-9]/g, "");
  const fieldCodes = value.replace(/[0-9]/g, "");
  const recentDateFields: MapRecentDateField[] = [];
  if (fieldCodes.includes("c")) recentDateFields.push("createdAt");
  if (fieldCodes.includes("u")) recentDateFields.push("updatedAt");

  return {
    recentDays: clampRecentDays(Number(days)),
    recentDateFields: fieldCodes === "" ? DEFAULT_MAP_FILTERS.recentDateFields : recentDateFields,
  };
}

function parseFlagToken(value: string): Pick<MapFilters, "showRadiolines" | "showHeatmap" | "showStations" | "source" | "showPlannedMeasurements"> {
  return {
    showRadiolines: value.includes("r"),
    showHeatmap: value.includes("h"),
    showStations: !value.includes("s"),
    source: value.includes("u") ? "uke" : "internal",
    showPlannedMeasurements: value.includes("p"),
  };
}

function parseTokenFilters(tokens: string[]): UrlFilters | null {
  if (tokens.length === 0) return null;

  let filters: MapFilters = DEFAULT_MAP_FILTERS;
  let legacyOperatorMncs: number[] = [];

  for (const token of tokens) {
    const key = token[0];
    const value = token.slice(1);
    switch (key) {
      case "o":
        legacyOperatorMncs = parseNumberList(value);
        break;
      case "i":
        filters = { ...filters, operatorIds: parseNumberList(value) };
        break;
      case "c":
        filters = { ...filters, countryCodes: value.toUpperCase().split(",") };
        break;
      case "b":
        filters = { ...filters, bands: parseNumberList(value) };
        break;
      case "r":
        filters = { ...filters, rat: value.split(",").filter(Boolean) };
        break;
      case "t":
        filters = { ...filters, status: parseStatusList(value) };
        break;
      case "n":
        filters = { ...filters, ...parseRecentToken(value) };
        break;
      case "p":
        filters = { ...filters, radiolineOperators: parseNumberList(value) };
        break;
      case "u":
        filters = { ...filters, uplinkTypes: value.split(",").filter(isUplinkType) };
        break;
      case "f":
        filters = { ...filters, ...parseFlagToken(value) };
        break;
    }
  }

  return { filters: sanitizeMapFilters(filters), legacyOperatorMncs };
}

function parseUrlHash(): ParsedUrlHash {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  if (!hash.startsWith("map=")) return { urlFilters: null };

  const hasTokens = hash.includes("~");
  const hasQuery = hash.includes("?");

  const mapSegment = hash.split(hasTokens ? "~" : "?")[0];
  const mapValue = mapSegment.replace("map=", "");
  const [zStr, latStr, lngStr] = mapValue.split("/");

  const z = Number.parseFloat(zStr || "");
  const lat = Number.parseFloat(latStr || "");
  const lng = Number.parseFloat(lngStr || "");

  let urlFilters: UrlFilters | null = null;
  let stationId: string | undefined;
  let ukeStationId: number | undefined;
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
      else if (key === "U") {
        const id = Number(value);
        if (Number.isSafeInteger(id) && id > 0) ukeStationId = id;
      }
    }
    urlFilters = parseTokenFilters(tokens.filter((token) => !TARGET_TOKEN_KEYS.has(token[0])));
  } else if (hasQuery) {
    const queryPart = hash.split("?")[1] ?? "";
    const params = new URLSearchParams(queryPart);
    urlFilters = parseLegacyFilters(params);
    stationId = params.get("station") || undefined;
    const locationIdStr = params.get("location");
    locationId = locationIdStr ? Number.parseInt(locationIdStr, 10) : undefined;
    const radiolineIdStr = params.get("radioline");
    radiolineId = radiolineIdStr ? Number.parseInt(radiolineIdStr, 10) : undefined;
  }

  return {
    urlFilters,
    center: !Number.isNaN(lat) && !Number.isNaN(lng) ? [lng, lat] : undefined,
    zoom: !Number.isNaN(z) ? z : undefined,
    stationId,
    ukeStationId,
    locationId: locationId !== undefined && !Number.isNaN(locationId) ? locationId : undefined,
    radiolineId: radiolineId !== undefined && !Number.isNaN(radiolineId) ? radiolineId : undefined,
  };
}

function buildUrlHash(filters: MapFilters, map: MapLibreMap): string {
  const tokens: string[] = [];

  if (filters.operatorIds.length > 0) tokens.push(`i${filters.operatorIds.join(",")}`);
  if (filters.countryCodes.length > 0) tokens.push(`c${filters.countryCodes.join(",")}`);
  if (filters.bands.length > 0) tokens.push(`b${filters.bands.join(",")}`);
  if (filters.rat.length > 0) tokens.push(`r${filters.rat.join(",")}`);
  if (!isDefaultMapStatus(filters.status)) tokens.push(`t${filters.status.map((status) => STATION_STATUS_URL_CODES[status]).join(",")}`);
  if (filters.recentDays !== null) {
    const fields = filters.recentDateFields.map((field) => (field === "createdAt" ? "c" : "u")).join("");
    const suffix = fields === "c" ? "" : fields;
    tokens.push(`n${filters.recentDays}${suffix}`);
  }
  if (filters.uplinkTypes.length > 0) tokens.push(`u${filters.uplinkTypes.join(",")}`);

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
  const mapPart = `map=${map.getZoom().toFixed(2)}/${center.lat.toFixed(6)}/${center.lng.toFixed(6)}`;

  return `#${mapPart}${tokens.length > 0 ? `~${tokens.join("~")}` : ""}`;
}

function addOperatorIds(filters: MapFilters, operatorIds: readonly number[]): MapFilters {
  return { ...filters, operatorIds: [...new Set([...filters.operatorIds, ...operatorIds])] };
}

function replaceMapHash(pathname: string, hash: string): void {
  if (window.location.pathname !== pathname) return;

  const newUrl = `${pathname}${window.location.search}${hash}`;
  window.history.replaceState(window.history.state, "", newUrl);
}

export function useUrlSync({ map, isLoaded, filters, enabled = true, onInitialize }: UseUrlSyncArgs): void {
  const queryClient = useQueryClient();
  const hasStartedInitialization = useRef(false);
  const isInitialized = useRef(false);
  const isMounted = useRef(false);
  const pathnameRef = useRef(window.location.pathname);
  const readFilters = useEffectEvent(() => filters);
  const notifyInitialized = useEffectEvent(onInitialize);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !isLoaded || !map || hasStartedInitialization.current) return;
    hasStartedInitialization.current = true;

    const { urlFilters, center, zoom, stationId, ukeStationId, locationId, radiolineId } = parseUrlHash();

    if (center || zoom !== undefined) {
      map.flyTo({
        center: center ?? map.getCenter(),
        zoom: zoom ?? map.getZoom(),
        essential: true,
        speed: 1.5,
      });
    }

    const initialize = (convertedOperatorIds: readonly number[]) => {
      if (!isMounted.current) return;

      const initialFilters = urlFilters === null ? undefined : addOperatorIds(urlFilters.filters, convertedOperatorIds);
      notifyInitialized({ filters: initialFilters, center, zoom, stationId, ukeStationId, locationId, radiolineId });
      isInitialized.current = true;
    };

    if (urlFilters === null || urlFilters.legacyOperatorMncs.length === 0) {
      initialize([]);
      return;
    }

    void queryClient.ensureQueryData(operatorsQueryOptions()).then(
      (operators) => initialize(findOperatorIdsByMncs(operators, urlFilters.legacyOperatorMncs)),
      () => initialize([]),
    );
  }, [enabled, isLoaded, map, queryClient]);

  useEffect(() => {
    if (!enabled || !isLoaded || !map) return;

    const handleMoveEnd = () => {
      if (!isInitialized.current) return;
      replaceMapHash(pathnameRef.current, buildUrlHash(readFilters(), map));
    };

    map.on("moveend", handleMoveEnd);
    return () => {
      map.off("moveend", handleMoveEnd);
    };
  }, [enabled, isLoaded, map]);

  useEffect(() => {
    if (!enabled || !isLoaded || !map || !isInitialized.current) return;

    replaceMapHash(pathnameRef.current, buildUrlHash(filters, map));
  }, [enabled, filters, isLoaded, map]);
}
