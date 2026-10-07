import { Navigate, createFileRoute } from "@tanstack/react-router";

import { RequireAuth } from "@/components/auth/requireAuth";
import { PageErrorState } from "@/components/ui/error-state";
import { SubmissionForm } from "@/features/submissions/components/submissionForm";
import { useFeatureGate } from "@/hooks/useFeatureGate";

type SubmissionSearch = {
  station?: string;
  edit?: string;
  uke?: string;
};

function SubmissionsPage() {
  const { station, edit, uke } = Route.useSearch();
  const { hasLoadError, isDisabled, isRetrying, retry } = useFeatureGate("submissions");

  if (hasLoadError) return <PageErrorState onRetry={() => retry()} isRetrying={isRetrying} />;
  if (isDisabled) return <Navigate to="/" replace />;

  const stationId = Number(station);
  return (
    <RequireAuth>
      <SubmissionForm
        key={`${station}|${edit}|${uke}`}
        stationId={Number.isSafeInteger(stationId) && stationId > 0 ? stationId : null}
        submissionId={edit === undefined || edit === "" ? null : edit}
        registerStationId={uke ?? null}
      />
    </RequireAuth>
  );
}

export const Route = createFileRoute("/_layout/submission/")({
  component: SubmissionsPage,
  validateSearch: (search: Record<string, unknown>): SubmissionSearch => ({
    station: search.station as string | undefined,
    edit: search.edit as string | undefined,
    uke: typeof search.uke === "string" || typeof search.uke === "number" ? String(search.uke) : undefined,
  }),
  staticData: {
    titleKey: "items.submitStation",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.contribute", i18nNamespace: "nav" }],
    mainClassName: "overflow-hidden max-md:pb-0",
  },
});
