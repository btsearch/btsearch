import { createFileRoute } from "@tanstack/react-router";

import { EnginePage } from "@/features/admin/measurements/engine/enginePage";

export const Route = createFileRoute("/_layout/admin/_layout/measurements/")({
  component: EnginePage,
  staticData: {
    titleKey: "items.measurements",
    i18nNamespace: "nav",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [{ titleKey: "sections.admin", i18nNamespace: "nav" }],
  },
});
