import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { CountryListPage } from "@/features/admin/reference/components/countries/countryListPage";
import {
  type ReferenceListPaging,
  parseReferenceListPagingSearch,
  readReferenceListPaging,
  toReferenceListPagingSearch,
} from "@/features/admin/reference/components/shared/referenceListSearch";

function AdminCountriesPage() {
  const navigate = useNavigate();
  const criteria = readReferenceListPaging(Route.useSearch());

  function changeCriteria(changes: Partial<ReferenceListPaging>) {
    void navigate({
      from: Route.fullPath,
      search: (current) => toReferenceListPagingSearch({ ...readReferenceListPaging(current), ...changes }),
      replace: true,
    });
  }

  return <CountryListPage criteria={criteria} onCriteriaChange={changeCriteria} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/countries/")({
  validateSearch: parseReferenceListPagingSearch,
  component: AdminCountriesPage,
  staticData: {
    titleKey: "items.countries",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.reference", i18nNamespace: "nav" }],
    allowedRoles: ["admin", "editor"],
  },
});
