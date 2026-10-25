import type {
  MeasurementDeviceModel,
  MeasurementDeviceModelList,
  MeasurementQuirkRule,
  MeasurementQuirkRuleUpdate,
  MeasurementReaderVersion,
  MeasurementReadingBlock,
  MeasurementReadingBlockCreate,
  MeasurementReadingBlockUpdate,
  MeasurementSoc,
  ObservationFlag,
  ObservationFlagList,
} from "@openbts/shared/contract";
import { keepPreviousData, queryOptions, skipToken } from "@tanstack/react-query";

import { measurementsAdminKeys } from "./keys";
import { API_V2_BASE, JSON_HEADERS, fetchJson, fetchV2Data } from "@/lib/api";

export type ReaderQuirkFlag = Extract<ObservationFlag, { kind: "readerQuirk" }>;

const LIST_LIMIT = 200;
const DEVICE_MODEL_SEARCH_LIMIT = 20;
const READER_QUIRK_FLAGS_LIMIT = 50;

async function fetchDeviceModels(query: URLSearchParams, signal: AbortSignal): Promise<MeasurementDeviceModel[]> {
  const page = await fetchJson<MeasurementDeviceModelList>(`${API_V2_BASE}/measurements/device-models?${query.toString()}`, { signal });
  return page.data;
}

async function fetchReaderQuirkFlags(signal: AbortSignal): Promise<ReaderQuirkFlag[]> {
  const query = new URLSearchParams({ kinds: "readerQuirk", statuses: "open", sort: "-createdAt", limit: String(READER_QUIRK_FLAGS_LIMIT) });
  const page = await fetchJson<ObservationFlagList>(`${API_V2_BASE}/observed/flags?${query.toString()}`, { signal });
  return page.data.filter((flag): flag is ReaderQuirkFlag => flag.kind === "readerQuirk");
}

export function readingBlocksQueryOptions() {
  return queryOptions({
    queryKey: measurementsAdminKeys.readingBlocks(),
    queryFn: ({ signal }) => fetchV2Data<MeasurementReadingBlock[]>("measurements/reading-blocks", { signal }),
    staleTime: 0,
  });
}

export function readerVersionsQueryOptions() {
  return queryOptions({
    queryKey: measurementsAdminKeys.readerVersions(),
    queryFn: ({ signal }) => fetchV2Data<MeasurementReaderVersion[]>("measurements/reader-versions", { signal }),
  });
}

export function quirkRulesQueryOptions() {
  return queryOptions({
    queryKey: measurementsAdminKeys.quirkRules(),
    queryFn: ({ signal }) => fetchV2Data<MeasurementQuirkRule[]>("measurements/quirk-rules", { signal }),
    staleTime: 0,
  });
}

export function readerQuirkFlagsQueryOptions() {
  return queryOptions({
    queryKey: measurementsAdminKeys.readerQuirkFlags(),
    queryFn: ({ signal }) => fetchReaderQuirkFlags(signal),
    staleTime: 0,
  });
}

export function socsQueryOptions() {
  return queryOptions({
    queryKey: measurementsAdminKeys.socs(),
    queryFn: ({ signal }) => fetchV2Data<MeasurementSoc[]>("measurements/socs", { signal }),
  });
}

export function deviceModelSearchQueryOptions(search: string) {
  const text = search.trim();
  return queryOptions({
    queryKey: measurementsAdminKeys.deviceModelSearch(text),
    queryFn:
      text === "" ? skipToken : ({ signal }) => fetchDeviceModels(new URLSearchParams({ q: text, limit: String(DEVICE_MODEL_SEARCH_LIMIT) }), signal),
    placeholderData: keepPreviousData,
  });
}

export function deviceModelsByIdsQueryOptions(ids: readonly number[]) {
  const sortedIds = [...new Set(ids)].sort((left, right) => left - right);
  return queryOptions({
    queryKey: measurementsAdminKeys.deviceModelsByIds(sortedIds),
    queryFn:
      sortedIds.length === 0
        ? skipToken
        : ({ signal }) =>
            fetchDeviceModels(new URLSearchParams({ ids: sortedIds.join(","), limit: String(Math.min(sortedIds.length, LIST_LIMIT)) }), signal),
  });
}

export function createReadingBlock(block: MeasurementReadingBlockCreate): Promise<MeasurementReadingBlock> {
  return fetchV2Data<MeasurementReadingBlock>("measurements/reading-blocks", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(block) });
}

export function updateReadingBlock(blockId: number, change: MeasurementReadingBlockUpdate): Promise<MeasurementReadingBlock> {
  return fetchV2Data<MeasurementReadingBlock>(`measurements/reading-blocks/${blockId}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(change),
  });
}

export function updateQuirkRule(ruleId: string, change: MeasurementQuirkRuleUpdate): Promise<MeasurementQuirkRule> {
  return fetchV2Data<MeasurementQuirkRule>(`measurements/quirk-rules/${encodeURIComponent(ruleId)}`, {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify(change),
  });
}
