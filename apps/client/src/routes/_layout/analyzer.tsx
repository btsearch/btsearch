import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { RequireAuth } from "@/components/auth/requireAuth";
import { AnalyzerPage } from "@/features/analyzer/components/analyzerPage";
import { type AnalyzerSearch, parseAnalyzerSearch } from "@/features/analyzer/model/search";

function AnalyzerRoute() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  function replaceSearch(nextSearch: AnalyzerSearch) {
    void navigate({ from: Route.fullPath, search: nextSearch, replace: true });
  }

  return (
    <RequireAuth>
      <AnalyzerPage search={search} onSearchChange={replaceSearch} />
    </RequireAuth>
  );
}

export const Route = createFileRoute("/_layout/analyzer")({
  validateSearch: parseAnalyzerSearch,
  component: AnalyzerRoute,
  staticData: {
    titleKey: "items.analyzer",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
