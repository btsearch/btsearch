import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { BrandListPage } from "@/features/admin/reference/components/brands/brandListPage";
import {
  type ReferenceListPaging,
  parseReferenceListPagingSearch,
  readReferenceListPaging,
  toReferenceListPagingSearch,
} from "@/features/admin/reference/components/shared/referenceListSearch";

function AdminBrandsPage() {
  const navigate = useNavigate();
  const criteria = readReferenceListPaging(Route.useSearch());

  function changeCriteria(changes: Partial<ReferenceListPaging>) {
    void navigate({
      from: Route.fullPath,
      search: (current) => toReferenceListPagingSearch({ ...readReferenceListPaging(current), ...changes }),
      replace: true,
    });
  }

  return <BrandListPage criteria={criteria} onCriteriaChange={changeCriteria} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/brands")({
  validateSearch: parseReferenceListPagingSearch,
  component: AdminBrandsPage,
  staticData: {
    titleKey: "items.brands",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.reference", i18nNamespace: "nav" }],
  },
});
