import { Navigate, createFileRoute } from "@tanstack/react-router";

import { PageErrorState } from "@/components/ui/error-state";
import { SubmissionReviewPage } from "@/features/admin/submissions/components/submissionReviewPage";
import { useFeatureGate } from "@/hooks/useFeatureGate";

function SubmissionDetailPage() {
  const { id } = Route.useParams();
  const { hasLoadError, isDisabled, isRetrying, retry } = useFeatureGate("submissions");

  if (hasLoadError) return <PageErrorState onRetry={() => retry()} isRetrying={isRetrying} />;
  if (isDisabled) return <Navigate to="/admin" replace />;

  return <SubmissionReviewPage key={id} submissionId={id} />;
}

export const Route = createFileRoute("/_layout/admin/_layout/submissions/$id")({
  component: SubmissionDetailPage,
  staticData: {
    mainClassName: "overflow-hidden max-md:pb-0",
    titleKey: "detail.title",
    i18nNamespace: "submissions",
    breadcrumbs: [
      { titleKey: "sections.admin", path: "/admin/stations", i18nNamespace: "nav" },
      { titleKey: "items.submissions", path: "/admin/submissions", i18nNamespace: "nav" },
    ],
    allowedRoles: ["admin", "editor"],
  },
});
