import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ContributorListPage } from "@/features/admin/measurements/contributors/contributorListPage";
import {
  type ContributorSort,
  parseContributorsSearch,
  readContributorSort,
  toContributorsSearch,
} from "@/features/admin/measurements/contributors/contributorsSearch";

function AdminContributorsPage() {
  const navigate = useNavigate();
  const sort = readContributorSort(Route.useSearch());

  function changeSort(nextSort: ContributorSort) {
    void navigate({ from: Route.fullPath, search: toContributorsSearch(nextSort), replace: true });
  }

  return <ContributorListPage sort={sort} onSortChange={changeSort} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/measurements/contributors/")({
  validateSearch: parseContributorsSearch,
  component: AdminContributorsPage,
  staticData: {
    titleKey: "measurements.tabs.contributors",
    i18nNamespace: "admin",
    breadcrumbs: [
      { titleKey: "sections.admin", i18nNamespace: "nav" },
      { titleKey: "items.measurements", path: "/admin/measurements", i18nNamespace: "nav" },
    ],
  },
});
