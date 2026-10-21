import { createFileRoute, useNavigate } from "@tanstack/react-router";

import {
  type StructureOwnerListCriteria,
  readStructureOwnerListCriteria,
  toStructureOwnerListSearch,
} from "@/features/admin/reference/components/owners/structureOwnerListCriteria";
import { StructureOwnerListPage } from "@/features/admin/reference/components/owners/structureOwnerListPage";
import { parseStructureOwnerListSearch } from "@/features/admin/reference/components/owners/structureOwnerListSearch";
import { FIRST_LIST_PAGE } from "@/features/stations/list/data/listPaging";

function AdminStructureOwnersPage() {
  const navigate = useNavigate();
  const criteria = readStructureOwnerListCriteria(Route.useSearch());

  function changeCriteria(changes: Partial<StructureOwnerListCriteria>) {
    void navigate({
      from: Route.fullPath,
      search: (current) => toStructureOwnerListSearch({ ...readStructureOwnerListCriteria(current), page: FIRST_LIST_PAGE, ...changes }),
      replace: true,
    });
  }

  return <StructureOwnerListPage criteria={criteria} onCriteriaChange={changeCriteria} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/structure-owners")({
  validateSearch: parseStructureOwnerListSearch,
  component: AdminStructureOwnersPage,
  staticData: {
    titleKey: "items.structureOwners",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.reference", i18nNamespace: "nav" }],
  },
});
