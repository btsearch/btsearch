import { createFileRoute } from "@tanstack/react-router";

import { BrandListPage } from "@/features/admin/reference/components/brands/brandListPage";

export const Route = createFileRoute("/_layout/admin/_layout/brands")({
  component: BrandListPage,
  staticData: {
    titleKey: "items.brands",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.reference", i18nNamespace: "nav" }],
  },
});
