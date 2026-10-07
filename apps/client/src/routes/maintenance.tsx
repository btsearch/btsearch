import { createFileRoute } from "@tanstack/react-router";

import { MaintenancePage } from "@/components/app/maintenancePage";
import i18n from "@/i18n/config";
import { APP_NAME } from "@/lib/api";

export const Route = createFileRoute("/maintenance")({
  component: MaintenancePage,
  head: () => ({
    meta: [{ title: `${i18n.t("common:errorPage.maintenance.title")} - ${APP_NAME}` }, { name: "robots", content: "noindex" }],
  }),
});
