import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { type BandListCriteria, readBandListCriteria, toBandListSearch } from "@/features/admin/reference/components/bands/bandListCriteria";
import { BandListPage } from "@/features/admin/reference/components/bands/bandListPage";
import { parseBandListSearch } from "@/features/admin/reference/components/bands/bandListSearch";

function AdminBandsPage() {
  const navigate = useNavigate();
  const criteria = readBandListCriteria(Route.useSearch());

  function changeCriteria(changes: Partial<BandListCriteria>) {
    void navigate({
      from: Route.fullPath,
      search: (current) => toBandListSearch({ ...readBandListCriteria(current), ...changes }),
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
