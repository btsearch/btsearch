import { createFileRoute } from "@tanstack/react-router";

import { AdminSettingsPage } from "@/features/admin/settings/components/adminSettingsPage";

export const Route = createFileRoute("/_layout/admin/_layout/settings")({
  component: AdminSettingsPage,
  staticData: {
    titleKey: "items.systemSettings",
    i18nNamespace: "nav",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [{ titleKey: "sections.admin", path: "/admin/stations", i18nNamespace: "nav" }],
  },
});
