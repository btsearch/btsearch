import { createFileRoute } from "@tanstack/react-router";

import { OperatorPage } from "@/features/admin/reference/components/operators/operatorPage";
import { parseRecordId } from "@/features/admin/reference/utils/ids";

function AdminOperatorPage() {
  const { id } = Route.useParams();

  return <OperatorPage operatorId={parseRecordId(id)} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/operators/$id")({
  component: AdminOperatorPage,
  staticData: {
    titleKey: "labels.operator",
    i18nNamespace: "common",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [
      { titleKey: "sections.reference", path: "/admin/operators", i18nNamespace: "nav" },
      { titleKey: "items.operators", path: "/admin/operators", i18nNamespace: "nav" },
    ],
  },
});
