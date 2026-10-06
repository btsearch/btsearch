import type { Paging, Photo, PhotoInclude, PhotoListQuery, PhotoSelection, StationBase, StationLocation } from "@openbts/shared/contract";
import { type InfiniteData, type UseInfiniteQueryResult, useInfiniteQuery } from "@tanstack/react-query";

import type { PhotosGalleryFilters } from "./galleryFilters";
import { RECENT_PHOTO_MS } from "@/components/photos/photoGridPrimitives";
import { LIST_STATION_STATUSES, isDefaultListStationStatuses } from "@/features/stations/list/data/listStationStatuses";
import { orderWords, sortUniqueCountryCodes, sortUniqueNumbers } from "@/features/stations/list/data/listUrlValues";
import { API_V2_BASE, appendList, fetchJson } from "@/lib/api";

export type GallerySelection = Omit<PhotoSelection, "station"> & { station: StationBase };
export type GalleryPhoto = Omit<Photo, "location" | "selections"> & { location: StationLocation; selections: GallerySelection[] };

export type PhotoListPage = {
  data: GalleryPhoto[];
  paging: Paging;
};

type PhotosGalleryQuery = Required<Pick<PhotoListQuery, "limit" | "sort" | "include">> &
  Pick<PhotoListQuery, "q" | "countryCodes" | "operatorIds" | "keepOtherCountries" | "regionIds" | "statuses" | "isMain" | "createdAfter">;

type PhotosGalleryQueryKey = readonly ["photos-gallery", "v2", PhotosGalleryQuery];

const PAGE_SIZE = 48;
const PHOTO_INCLUDES: PhotoInclude[] = ["location", "selections.station"];
const STALE_TIME_MS = 1000 * 60 * 5;
const HOUR_MS = 1000 * 60 * 60;

export function getRecentUploadsStart(): string {
  const start = Date.now() - RECENT_PHOTO_MS;
  return new Date(start - (start % HOUR_MS)).toISOString();
}

function toPhotosGalleryQuery(filters: PhotosGalleryFilters, recentUploadsStart: string): PhotosGalleryQuery {
  const query: PhotosGalleryQuery = { limit: PAGE_SIZE, sort: filters.sort, include: PHOTO_INCLUDES };

  if (filters.searchText !== "") query.q = filters.searchText;
  if (filters.countryCodes.length > 0) query.countryCodes = sortUniqueCountryCodes(filters.countryCodes);
  if (filters.operatorIds.length > 0) {
    query.operatorIds = sortUniqueNumbers(filters.operatorIds);
    query.keepOtherCountries = true;
  }
  if (filters.regionIds.length > 0) query.regionIds = sortUniqueNumbers(filters.regionIds);
  if (!isDefaultListStationStatuses(filters.statuses)) query.statuses = orderWords(LIST_STATION_STATUSES, filters.statuses);
  if (filters.isMainOnly) query.isMain = true;
  if (filters.isRecentOnly) query.createdAfter = recentUploadsStart;
  return query;
}

function toSearchParams(query: PhotosGalleryQuery, cursor: string | null): URLSearchParams {
  const params = new URLSearchParams({ limit: String(query.limit), sort: query.sort, include: query.include.join(",") });

  if (cursor === null) params.set("includeTotal", "true");
  else params.set("cursor", cursor);
  if (query.q !== undefined) params.set("q", query.q);
  appendList(params, "countryCodes", query.countryCodes);
  appendList(params, "operatorIds", query.operatorIds);
  if (query.keepOtherCountries === true) params.set("keepOtherCountries", "true");
  appendList(params, "regionIds", query.regionIds);
  appendList(params, "statuses", query.statuses);
  if (query.isMain === true) params.set("isMain", "true");
  if (query.createdAfter !== undefined) params.set("createdAfter", query.createdAfter);
  return params;
}

function fetchPhotosGalleryPage(query: PhotosGalleryQuery, cursor: string | null, signal: AbortSignal): Promise<PhotoListPage> {
  return fetchJson<PhotoListPage>(`${API_V2_BASE}/photos?${toSearchParams(query, cursor).toString()}`, { signal });
}

export function usePhotosGalleryPages(
  filters: PhotosGalleryFilters,
  recentUploadsStart: string,
): UseInfiniteQueryResult<InfiniteData<PhotoListPage>> {
  const query = toPhotosGalleryQuery(filters, recentUploadsStart);

  return useInfiniteQuery<PhotoListPage, Error, InfiniteData<PhotoListPage>, PhotosGalleryQueryKey, string | null>({
    queryKey: ["photos-gallery", "v2", query],
    queryFn: ({ pageParam, signal }) => fetchPhotosGalleryPage(query, pageParam, signal),
    initialPageParam: null,
    getNextPageParam: (lastPage) => lastPage.paging.nextCursor,
    staleTime: STALE_TIME_MS,
  });
}
