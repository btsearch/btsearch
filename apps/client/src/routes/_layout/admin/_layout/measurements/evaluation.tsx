import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { EvaluationPage } from "@/features/admin/measurements/evaluation/evaluationPage";
import { parseEvaluationSearch } from "@/features/admin/measurements/evaluation/evaluationSearch";

function AdminEvaluationPage() {
  const navigate = useNavigate();
  const { night } = Route.useSearch();

  function changeNight(nextNight: number | undefined) {
    void navigate({ from: Route.fullPath, search: { night: nextNight }, replace: true });
  }

  return <EvaluationPage nightId={night} onNightChange={changeNight} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/measurements/evaluation")({
  validateSearch: parseEvaluationSearch,
  component: AdminEvaluationPage,
  staticData: {
    titleKey: "measurements.tabs.evaluation",
    i18nNamespace: "admin",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [
      { titleKey: "sections.admin", i18nNamespace: "nav" },
      { titleKey: "items.measurements", path: "/admin/measurements", i18nNamespace: "nav" },
    ],
  },
});
