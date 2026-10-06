import { createFileRoute } from "@tanstack/react-router";

import { SubmissionReviewPage } from "@/features/admin/submissions/components/submissionReviewPage";

function SubmissionDetailPage() {
  const { id } = Route.useParams();

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
