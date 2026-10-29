import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ForbiddenState } from "@/components/auth/requireRole";
import { PageErrorState } from "@/components/ui/error-state";
import { AuditLogsPage } from "@/features/admin/audit-operations/page/auditLogsPage";
import {
  type AuditLogsCriteria,
  parseAuditLogsSearch,
  readAuditLogsCriteria,
  toAuditLogsSearch,
} from "@/features/admin/audit-operations/page/auditLogsSearch";
import { useReferenceAccess } from "@/features/admin/reference/access/useReferenceAccess";

function AuditLogsRoutePage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const access = useReferenceAccess();

  function changeCriteria(changes: Partial<AuditLogsCriteria>) {
    void navigate({
      from: Route.fullPath,
      search: (current) => toAuditLogsSearch({ ...readAuditLogsCriteria(current), ...changes }),
      replace: true,
    });
  }

  if (access.isPending) return null;
  if (access.hasLoadFailed) return <PageErrorState onRetry={access.retry} />;
  if (!access.canOpenCountries) return <ForbiddenState />;

  return <AuditLogsPage criteria={readAuditLogsCriteria(search)} onCriteriaChange={changeCriteria} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/audit-logs")({
  validateSearch: parseAuditLogsSearch,
  component: AuditLogsRoutePage,
  staticData: {
    titleKey: "items.auditLogs",
    i18nNamespace: "nav",
    allowedRoles: ["admin", "editor"],
    breadcrumbs: [{ titleKey: "sections.admin", path: "/admin/stations", i18nNamespace: "nav" }],
  },
});
