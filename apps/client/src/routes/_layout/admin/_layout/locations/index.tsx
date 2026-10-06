import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { LocationsListPage } from "@/features/admin/locations/list/components/locationsListPage";
import { type LocationsListSearch, parseLocationsListSearch } from "@/features/admin/locations/list/data/locationsListSearch";

function AdminLocationsListPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  function replaceSearch(nextSearch: LocationsListSearch) {
    void navigate({ from: Route.fullPath, search: nextSearch, replace: true });
  }

  return <LocationsListPage search={search} onSearchChange={replaceSearch} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/locations/")({
  validateSearch: parseLocationsListSearch,
  component: AdminLocationsListPage,
  staticData: {
    titleKey: "items.locations",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.admin", i18nNamespace: "nav" }],
    allowedRoles: ["admin", "editor"],
  },
});
