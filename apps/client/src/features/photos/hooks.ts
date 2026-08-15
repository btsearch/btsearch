import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { useInfiniteQuery } from "@tanstack/react-query";

import { type PhotosGalleryFilters, type PhotosGalleryPage, fetchPhotosGallery } from "./api";

const PHOTOS_LIMIT = 48;
const STALE_TIME_MS = 1000 * 60 * 5;

type PhotosGalleryQueryKey = readonly [
  "photos-gallery",
  string,
  number | null,
  string | null,
  string,
  PhotosGalleryFilters["sortBy"],
  PhotosGalleryFilters["order"],
  boolean,
  boolean,
];

export function usePhotosGallery(filters: PhotosGalleryFilters): UseInfiniteQueryResult<InfiniteData<PhotosGalleryPage>> {
  return useInfiniteQuery<PhotosGalleryPage, Error, InfiniteData<PhotosGalleryPage>, PhotosGalleryQueryKey, number>({
    queryKey: [
      "photos-gallery",
      filters.q.trim(),
      filters.operator,
      filters.region,
      filters.statuses.join(","),
      filters.sortBy,
      filters.order,
      filters.mainOnly,
      filters.recentOnly,
    ],
    queryFn: ({ pageParam }) => fetchPhotosGallery(PHOTOS_LIMIT, pageParam, filters),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const fetched = allPages.reduce((total, page) => total + page.data.length, 0);
      const totalCount = allPages[0]?.totalCount ?? lastPage.totalCount;
      return fetched < totalCount ? allPages.length + 1 : undefined;
    },
    staleTime: STALE_TIME_MS,
  });
}
