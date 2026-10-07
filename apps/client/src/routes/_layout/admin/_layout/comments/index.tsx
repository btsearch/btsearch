import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { AdminCommentsPage } from "@/features/admin/comments/page/adminCommentsPage";
import {
  type AdminCommentsCriteria,
  parseAdminCommentsSearch,
  readAdminCommentsCriteria,
  toAdminCommentsSearch,
} from "@/features/admin/comments/page/commentsSearch";

function AdminCommentsRoutePage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const hasOldAuthorLink = search.author !== undefined;

  useEffect(() => {
    if (!hasOldAuthorLink) return;
    void navigate({ from: Route.fullPath, search: (current) => toAdminCommentsSearch(readAdminCommentsCriteria(current)), replace: true });
  }, [hasOldAuthorLink, navigate]);

  function changeCriteria(changes: Partial<AdminCommentsCriteria>) {
    void navigate({
      from: Route.fullPath,
      search: (current) => toAdminCommentsSearch({ ...readAdminCommentsCriteria(current), ...changes }),
      replace: true,
    });
  }

  return <AdminCommentsPage criteria={readAdminCommentsCriteria(search)} onCriteriaChange={changeCriteria} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/comments/")({
  validateSearch: parseAdminCommentsSearch,
  component: AdminCommentsRoutePage,
  staticData: {
    titleKey: "items.comments",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.admin", i18nNamespace: "nav" }],
    allowedRoles: ["admin", "editor"],
  },
});
