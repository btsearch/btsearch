import { createFileRoute } from "@tanstack/react-router";

import { RequireAuth } from "@/components/auth/requireAuth";
import { AnalyzerBatchPage } from "@/features/analyzer/batch/components/analyzerBatchPage";

export const Route = createFileRoute("/_layout/submission/from-analyzer")({
  validateSearch: (search: Record<string, unknown>) => ({ draft: typeof search.draft === "string" && search.draft ? search.draft : undefined }),
  component: BatchRoute,
  staticData: {
    titleKey: "batch.title",
    i18nNamespace: "cellAnalyzer",
    breadcrumbs: [{ titleKey: "sections.contribute", i18nNamespace: "nav", path: "/submission" }],
    mainClassName: "overflow-hidden max-md:pb-0",
  },
});

function BatchRoute() {
  const { draft } = Route.useSearch();
  return <RequireAuth render={(session) => <AnalyzerBatchPage key={draft ?? ""} draftId={draft} role={session.user.role} />} />;
}
