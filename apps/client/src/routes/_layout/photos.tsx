import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { PhotosGalleryPage } from "@/features/photos/components/photosGalleryPage";
import { type PhotosGallerySearch, parsePhotosGallerySearch } from "@/features/photos/galleryFilters";
import { buildStaticPageHead } from "@/lib/seo";

function PhotosGalleryRoute() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  function replaceSearch(nextSearch: PhotosGallerySearch) {
    void navigate({ from: Route.fullPath, search: nextSearch, replace: true });
  }

  return <PhotosGalleryPage search={search} onSearchChange={replaceSearch} />;
}

export const Route = createFileRoute("/_layout/photos")({
  validateSearch: parsePhotosGallerySearch,
  component: PhotosGalleryRoute,
  head: () => buildStaticPageHead("/photos"),
  staticData: {
    titleKey: "items.photos",
    i18nNamespace: "nav",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
