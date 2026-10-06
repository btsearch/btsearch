import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { StationsListPage } from "@/features/stations/list/components/stationsListPage";
import { type StationsListSearch, parseAdminStationsListSearch } from "@/features/stations/list/data/stationsListSearch";

function AdminStationsListPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  function replaceSearch(nextSearch: StationsListSearch) {
    void navigate({ from: Route.fullPath, search: nextSearch, replace: true });
  }

  return <StationsListPage variant="admin" search={search} onSearchChange={replaceSearch} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/stations/")({
  validateSearch: parseAdminStationsListSearch,
  component: AdminStationsListPage,
  staticData: {
    titleKey: "items.stations",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.admin", i18nNamespace: "nav" }],
    allowedRoles: ["admin", "editor"],
  },
});
