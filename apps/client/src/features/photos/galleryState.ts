import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  type PhotosGalleryFilters,
  type PhotosGalleryFiltersUpdate,
  type PhotosGallerySearch,
  getPhotosGalleryFiltersKey,
  readPhotoSearchText,
  readPhotosGalleryFilters,
  toPhotosGallerySearch,
} from "./galleryFilters";
import { getRecentUploadsStart } from "./galleryRequests";
import { useAppliedListFilters } from "@/features/stations/list/data/listPageQuery";
import { type ListPanelScope, useListPanelScope } from "@/features/stations/list/data/listPanel";
import { fitListFiltersToScope, narrowListToCountries } from "@/features/stations/list/data/listScope";

type UsePhotosGalleryStateArgs = {
  search: PhotosGallerySearch;
  onSearchChange: (search: PhotosGallerySearch) => void;
};

type PhotosGalleryState = {
  filters: PhotosGalleryFilters;
  appliedFilters: PhotosGalleryFilters;
  appliedFiltersKey: string;
  recentUploadsStart: string;
  scope: ListPanelScope;
  changeFilters: (update: PhotosGalleryFiltersUpdate) => void;
  pickCountries: (countryCodes: readonly string[]) => void;
};

const PUBLIC_LIST = false;

export function usePhotosGalleryState({ search, onSearchChange }: UsePhotosGalleryStateArgs): PhotosGalleryState {
  const { q, countries, operators, regions, statuses, photos, sort } = search;
  const urlFacets = useMemo(
    () => readPhotosGalleryFilters({ countries, operators, regions, statuses, photos, sort }),
    [countries, operators, regions, statuses, photos, sort],
  );
  const scope = useListPanelScope(urlFacets.countryCodes, PUBLIC_LIST);
  const { lookups, area } = scope;
  const facets = useMemo(() => {
    if (lookups === undefined || area === undefined) return urlFacets;
    return fitListFiltersToScope(urlFacets, urlFacets.countryCodes, lookups, area).filters;
  }, [urlFacets, lookups, area]);
  const filters = useMemo(() => ({ ...facets, searchText: readPhotoSearchText(q) }), [facets, q]);
  const filtersKey = getPhotosGalleryFiltersKey(filters);
  const facetsKey = getPhotosGalleryFiltersKey(facets);
  const urlFacetsKey = getPhotosGalleryFiltersKey(urlFacets);
  const appliedFilters = useAppliedListFilters(filters, filtersKey);
  const [recentUploadsStart, setRecentUploadsStart] = useState(getRecentUploadsStart);
  const latestFilters = useRef(filters);
  const replaceUnfittedSearch = useEffectEvent(() => onSearchChange(toPhotosGallerySearch(filters)));

  useLayoutEffect(() => {
    latestFilters.current = filters;
  }, [filters]);

  useEffect(() => {
    if (facetsKey !== urlFacetsKey) replaceUnfittedSearch();
  }, [facetsKey, urlFacetsKey]);

  function changeFilters(update: PhotosGalleryFiltersUpdate) {
    const nextFilters = update(latestFilters.current);

    latestFilters.current = nextFilters;
    setRecentUploadsStart(getRecentUploadsStart());
    onSearchChange(toPhotosGallerySearch(nextFilters));
  }

  function pickCountries(countryCodes: readonly string[]) {
    changeFilters((current) => narrowListToCountries(current, countryCodes, { lookups, area }));
  }

  return {
    filters,
    appliedFilters,
    appliedFiltersKey: getPhotosGalleryFiltersKey(appliedFilters),
    recentUploadsStart,
    scope,
    changeFilters,
    pickCountries,
  };
}
