import { createFileRoute } from "@tanstack/react-router";

import { PhotosGallery } from "@/features/photos/components/PhotosGallery";
import { buildStaticPageHead } from "@/lib/seo";

export const Route = createFileRoute("/_layout/photos")({
  component: PhotosGallery,
  head: () => buildStaticPageHead("/photos"),
  staticData: {
    titleKey: "items.photos",
    i18nNamespace: "nav",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
