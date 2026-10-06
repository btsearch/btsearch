import { createFileRoute } from "@tanstack/react-router";

import { CountryListPage } from "@/features/admin/reference/components/countries/countryListPage";

export const Route = createFileRoute("/_layout/admin/_layout/countries/")({
  component: CountryListPage,
  staticData: {
    titleKey: "items.countries",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.reference", i18nNamespace: "nav" }],
    allowedRoles: ["admin", "editor"],
  },
});
