import type { PhotoSort, StationStatus } from "@openbts/shared/contract";

import {
  DEFAULT_LIST_STATION_STATUSES,
  LIST_STATION_STATUSES,
  isDefaultListStationStatuses,
} from "@/features/stations/list/data/listStationStatuses";
import {
  type ListUrlSearch,
  decodeUrlText,
  encodeUrlText,
  joinUrlValues,
  orderWords,
  parseUrlCountryCodes,
  parseUrlEnum,
  parseUrlIds,
  sortUniqueCountryCodes,
  sortUniqueNumbers,
  toWrittenListSearch,
} from "@/features/stations/list/data/listUrlValues";
import { normalizeSearchText } from "@/lib/apiValues";
import { toggleValue } from "@/lib/utils";

export type PhotosGallerySortBy = "uploaded" | "taken" | "station";
export type PhotosGalleryOrder = "asc" | "desc";

export type PhotosGalleryFilters = {
  searchText: string;
  countryCodes: string[];
  operatorIds: number[];
  regionIds: number[];
  statuses: StationStatus[];
  isMainOnly: boolean;
  isRecentOnly: boolean;
  sort: PhotoSort;
};

export type PhotosGalleryFiltersUpdate = (current: PhotosGalleryFilters) => PhotosGalleryFilters;

export type PhotosGallerySearch = {
  q?: string;
  countries?: string;
  operators?: string;
  regions?: string;
  statuses?: string;
  photos?: string;
  sort?: PhotoSort;
};

type PhotoChoiceWord = "main" | "recent";

type SortParts = {
  sortBy: PhotosGallerySortBy;
  order: PhotosGalleryOrder;
};

const SORT_PARTS: Record<PhotoSort, SortParts> = {
  "-createdAt": { sortBy: "uploaded", order: "desc" },
  createdAt: { sortBy: "uploaded", order: "asc" },
  "-takenAt": { sortBy: "taken", order: "desc" },
  takenAt: { sortBy: "taken", order: "asc" },
  siteId: { sortBy: "station", order: "asc" },
  "-siteId": { sortBy: "station", order: "desc" },
};
const SORTS: Record<PhotosGallerySortBy, Record<PhotosGalleryOrder, PhotoSort>> = {
  uploaded: { asc: "createdAt", desc: "-createdAt" },
  taken: { asc: "takenAt", desc: "-takenAt" },
  station: { asc: "siteId", desc: "-siteId" },
};
const PHOTO_CHOICE_WORDS: readonly PhotoChoiceWord[] = ["main", "recent"];
const PHOTOS_GALLERY_SORTS: readonly PhotoSort[] = Object.values(SORTS).flatMap((orders) => [orders.asc, orders.desc]);

export const PHOTO_SEARCH_TEXT_MAX_LENGTH = 100;
export const PHOTOS_GALLERY_SORT_FIELDS: readonly PhotosGallerySortBy[] = ["station", "uploaded", "taken"];
export const PHOTOS_GALLERY_ORDERS: readonly PhotosGalleryOrder[] = ["asc", "desc"];
export const DEFAULT_PHOTOS_GALLERY_SORT: PhotoSort = "-createdAt";

export const DEFAULT_PHOTOS_GALLERY_FILTERS: PhotosGalleryFilters = {
  searchText: "",
  countryCodes: [],
  operatorIds: [],
  regionIds: [],
  statuses: [...DEFAULT_LIST_STATION_STATUSES],
  isMainOnly: false,
  isRecentOnly: false,
  sort: DEFAULT_PHOTOS_GALLERY_SORT,
};

export function normalizePhotoSearchText(searchText: string): string {
  return normalizeSearchText(searchText).slice(0, PHOTO_SEARCH_TEXT_MAX_LENGTH).trim();
}

export function readPhotoSearchText(urlText: unknown): string {
  return normalizePhotoSearchText(decodeUrlText(urlText));
}

export function readPhotosGalleryFilters(search: ListUrlSearch): PhotosGalleryFilters {
  const statuses = parseUrlEnum(search.statuses, LIST_STATION_STATUSES);
  const photoChoices = parseUrlEnum(search.photos, PHOTO_CHOICE_WORDS);
  const [sort = DEFAULT_PHOTOS_GALLERY_SORT] = parseUrlEnum(search.sort, PHOTOS_GALLERY_SORTS);

  return {
    searchText: readPhotoSearchText(search.q),
    countryCodes: parseUrlCountryCodes(search.countries),
    operatorIds: parseUrlIds(search.operators),
    regionIds: parseUrlIds(search.regions),
    statuses: statuses.length > 0 ? statuses : [...DEFAULT_LIST_STATION_STATUSES],
    isMainOnly: photoChoices.includes("main"),
    isRecentOnly: photoChoices.includes("recent"),
    sort,
  };
}

export function toPhotosGallerySearch(filters: PhotosGalleryFilters): PhotosGallerySearch {
  const photoChoices: PhotoChoiceWord[] = [];
  if (filters.isMainOnly) photoChoices.push("main");
  if (filters.isRecentOnly) photoChoices.push("recent");

  return {
    q: encodeUrlText(normalizePhotoSearchText(filters.searchText)),
    countries: joinUrlValues(sortUniqueCountryCodes(filters.countryCodes)),
    operators: joinUrlValues(sortUniqueNumbers(filters.operatorIds)),
    regions: joinUrlValues(sortUniqueNumbers(filters.regionIds)),
    statuses: isDefaultListStationStatuses(filters.statuses) ? undefined : joinUrlValues(orderWords(LIST_STATION_STATUSES, filters.statuses)),
    photos: joinUrlValues(photoChoices),
    sort: filters.sort === DEFAULT_PHOTOS_GALLERY_SORT ? undefined : filters.sort,
  };
}

export function parsePhotosGallerySearch(search: Record<string, unknown>): PhotosGallerySearch {
  return toPhotosGallerySearch(readPhotosGalleryFilters(toWrittenListSearch(search)));
}

export function getPhotosGallerySortParts(sort: PhotoSort): SortParts {
  return SORT_PARTS[sort];
}

export function setPhotosGallerySortBy(filters: PhotosGalleryFilters, sortBy: PhotosGallerySortBy): PhotosGalleryFilters {
  return { ...filters, sort: SORTS[sortBy][SORT_PARTS[filters.sort].order] };
}

export function setPhotosGalleryOrder(filters: PhotosGalleryFilters, order: PhotosGalleryOrder): PhotosGalleryFilters {
  return { ...filters, sort: SORTS[SORT_PARTS[filters.sort].sortBy][order] };
}

export function togglePhotosGalleryOrder(filters: PhotosGalleryFilters): PhotosGalleryFilters {
  return setPhotosGalleryOrder(filters, SORT_PARTS[filters.sort].order === "asc" ? "desc" : "asc");
}

export function togglePhotosGalleryStatus(filters: PhotosGalleryFilters, status: StationStatus): PhotosGalleryFilters {
  const statuses = orderWords(LIST_STATION_STATUSES, toggleValue(filters.statuses, status));
  return statuses.length === 0 ? filters : { ...filters, statuses };
}

export function countPhotosGalleryRailFilters(filters: PhotosGalleryFilters): number {
  const isFilterSet = [
    filters.countryCodes.length > 0,
    filters.operatorIds.length > 0,
    filters.regionIds.length > 0,
    !isDefaultListStationStatuses(filters.statuses),
    filters.isMainOnly,
    filters.isRecentOnly,
  ];
  return isFilterSet.filter(Boolean).length;
}

export function countActivePhotosGalleryFilters(filters: PhotosGalleryFilters): number {
  return countPhotosGalleryRailFilters(filters) + (filters.searchText === "" ? 0 : 1);
}

export function clearPhotosGalleryFilters(filters: PhotosGalleryFilters): PhotosGalleryFilters {
  return { ...DEFAULT_PHOTOS_GALLERY_FILTERS, sort: filters.sort };
}

export function clearPhotosGalleryRailFilters(filters: PhotosGalleryFilters): PhotosGalleryFilters {
  return { ...DEFAULT_PHOTOS_GALLERY_FILTERS, searchText: filters.searchText, sort: filters.sort };
}

export function getPhotosGalleryFiltersKey(filters: PhotosGalleryFilters): string {
  return JSON.stringify(toPhotosGallerySearch(filters));
}
