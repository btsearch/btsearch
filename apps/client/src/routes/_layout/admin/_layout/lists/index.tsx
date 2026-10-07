import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { AdminListsPage } from "@/features/admin/lists/components/adminListsPage";
import { type AdminListsCriteria, parseAdminListsSearch, readAdminListsCriteria, toAdminListsSearch } from "@/features/admin/lists/listsSearch";

function AdminListsRoutePage() {
  const navigate = useNavigate();
  const criteria = readAdminListsCriteria(Route.useSearch());

  function changeCriteria(changes: Partial<AdminListsCriteria>) {
    void navigate({
      from: Route.fullPath,
      search: (current) => toAdminListsSearch({ ...readAdminListsCriteria(current), ...changes }),
      replace: true,
    });
  }

  return <AdminListsPage criteria={criteria} onCriteriaChange={changeCriteria} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/lists/")({
  validateSearch: parseAdminListsSearch,
  component: AdminListsRoutePage,
  staticData: {
    titleKey: "items.lists",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.admin", path: "/admin/stations", i18nNamespace: "nav" }],
    allowedRoles: ["admin"],
  },
});
