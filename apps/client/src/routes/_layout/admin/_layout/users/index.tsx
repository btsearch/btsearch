import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { type UserListCriteria, readUserListCriteria, toUserListSearch } from "@/features/admin/users/components/list/userListCriteria";
import { UserListPage } from "@/features/admin/users/components/list/userListPage";
import { parseUserListSearch } from "@/features/admin/users/components/list/userListSearch";

function AdminUsersPage() {
  const navigate = useNavigate();
  const criteria = readUserListCriteria(Route.useSearch());

  function changeCriteria(changes: Partial<UserListCriteria>) {
    void navigate({
      from: Route.fullPath,
      search: (current) => toUserListSearch({ ...readUserListCriteria(current), ...changes }),
      replace: true,
    });
  }

  return <UserListPage criteria={criteria} onCriteriaChange={changeCriteria} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/users/")({
  validateSearch: parseUserListSearch,
  component: AdminUsersPage,
  staticData: {
    titleKey: "items.users",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.admin", i18nNamespace: "nav" }],
  },
});
