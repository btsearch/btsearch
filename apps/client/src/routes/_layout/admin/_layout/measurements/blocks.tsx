import { createFileRoute } from "@tanstack/react-router";

import { BlocksPage } from "@/features/admin/measurements/blocks/blocksPage";

export const Route = createFileRoute("/_layout/admin/_layout/measurements/blocks")({
  component: BlocksPage,
  staticData: {
    titleKey: "measurements.tabs.blocks",
    i18nNamespace: "admin",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [
      { titleKey: "sections.admin", i18nNamespace: "nav" },
      { titleKey: "items.measurements", path: "/admin/measurements", i18nNamespace: "nav" },
    ],
  },
});
