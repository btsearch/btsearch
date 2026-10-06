import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { StationsListPage } from "@/features/stations/list/components/stationsListPage";
import { type StationsListSearch, parsePublicStationsListSearch } from "@/features/stations/list/data/stationsListSearch";
import { buildStaticPageHead } from "@/lib/seo";

function PublicStationsListPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  function replaceSearch(nextSearch: StationsListSearch) {
    void navigate({ from: Route.fullPath, search: nextSearch, replace: true });
  }

  return <StationsListPage variant="public" search={search} onSearchChange={replaceSearch} />;
}

export const Route = createFileRoute("/_layout/stations")({
  validateSearch: parsePublicStationsListSearch,
  component: PublicStationsListPage,
  head: () => buildStaticPageHead("/stations"),
  staticData: {
    titleKey: "items.database",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
