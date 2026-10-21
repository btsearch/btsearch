import { createFileRoute, useNavigate } from "@tanstack/react-router";

import {
  type OperatorListCriteria,
  parseOperatorListSearch,
  readOperatorListCriteria,
  toOperatorListSearch,
} from "@/features/admin/reference/components/operators/operatorListCriteria";
import { OperatorListPage } from "@/features/admin/reference/components/operators/operatorListPage";
import { FIRST_LIST_PAGE } from "@/features/stations/list/data/listPaging";

function AdminOperatorsPage() {
  const navigate = useNavigate();
  const criteria = readOperatorListCriteria(Route.useSearch());

  function changeCriteria(changes: Partial<OperatorListCriteria>) {
    void navigate({
      from: Route.fullPath,
      search: (current) => toOperatorListSearch({ ...readOperatorListCriteria(current), page: FIRST_LIST_PAGE, ...changes }),
      replace: true,
    });
  }

  return <OperatorListPage criteria={criteria} onCriteriaChange={changeCriteria} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/operators/")({
  validateSearch: parseOperatorListSearch,
  component: AdminOperatorsPage,
  staticData: {
    titleKey: "items.operators",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.reference", i18nNamespace: "nav" }],
  },
});
