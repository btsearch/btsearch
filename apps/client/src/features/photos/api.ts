import { API_BASE, fetchJson } from "@/lib/api";
import type { StationStatus } from "@/types/station";

export type GalleryPhoto = {
  id: number;
  location_photo_id: number;
  attachment_uuid: string;
  mime_type: string;
  is_main: boolean;
  note: string | null;
  taken_at: string | null;
  createdAt: string;
  author: { uuid: string; username: string; name: string } | null;
  station: {
    id: number;
    station_id: string;
    status: StationStatus;
    operator: { id: number; name: string; mnc: number | null } | null;
  };
  location: {
    id: number;
    city: string | null;
    address: string | null;
    label: string;
    latitude: number;
    longitude: number;
  };
};

export type PhotosGalleryPage = {
  data: GalleryPhoto[];
  totalCount: number;
};

export type PhotosGallerySortBy = "uploaded" | "taken" | "station";
export type PhotosGalleryOrder = "asc" | "desc";

export type PhotosGalleryFilters = {
  q: string;
  operator: number | null;
  region: string | null;
  statuses: StationStatus[];
  sortBy: PhotosGallerySortBy;
  order: PhotosGalleryOrder;
  mainOnly: boolean;
  recentOnly: boolean;
};

export function fetchPhotosGallery(limit: number, page: number, filters: PhotosGalleryFilters) {
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
    sortBy: filters.sortBy,
    order: filters.order,
  });

  const query = filters.q.trim();
  if (query.length > 0) params.set("q", query);
  if (filters.operator !== null) params.set("operator", String(filters.operator));
  if (filters.region !== null) params.set("region", filters.region);
  if (filters.statuses.length > 0) params.set("status", filters.statuses.join(","));
  if (filters.mainOnly) params.set("mainOnly", "true");
  if (filters.recentOnly) params.set("recentDays", "7");

  return fetchJson<PhotosGalleryPage>(`${API_BASE}/photos?${params.toString()}`);
}
