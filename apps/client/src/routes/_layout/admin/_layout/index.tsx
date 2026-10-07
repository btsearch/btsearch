import { createFileRoute } from "@tanstack/react-router";

import { DashboardPage } from "@/features/admin/dashboard/dashboardPage";

export const Route = createFileRoute("/_layout/admin/_layout/")({
  component: DashboardPage,
  staticData: {
    titleKey: "items.dashboard",
    i18nNamespace: "nav",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [{ titleKey: "sections.admin", i18nNamespace: "nav" }],
    allowedRoles: ["admin", "editor"],
  },
});
