import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { type BandListCriteria, readBandListCriteria, toBandListSearch } from "@/features/admin/reference/components/bands/bandListCriteria";
import { BandListPage } from "@/features/admin/reference/components/bands/bandListPage";
import { parseBandListSearch } from "@/features/admin/reference/components/bands/bandListSearch";
import { FIRST_LIST_PAGE } from "@/features/stations/list/data/listPaging";

function AdminBandsPage() {
  const navigate = useNavigate();
  const criteria = readBandListCriteria(Route.useSearch());

  function changeCriteria(changes: Partial<BandListCriteria>) {
    void navigate({
      from: Route.fullPath,
      search: (current) => toBandListSearch({ ...readBandListCriteria(current), page: FIRST_LIST_PAGE, ...changes }),
      replace: true,
    });
  }

  return <BandListPage criteria={criteria} onCriteriaChange={changeCriteria} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/bands")({
  validateSearch: parseBandListSearch,
  component: AdminBandsPage,
  staticData: {
    titleKey: "items.bands",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.reference", i18nNamespace: "nav" }],
  },
});
