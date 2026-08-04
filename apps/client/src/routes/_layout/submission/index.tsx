import { Navigate, createFileRoute } from "@tanstack/react-router";

import { RequireAuth } from "@/components/auth/requireAuth";
import { SubmissionForm } from "@/features/submissions/components/submissionForm";
import { useSettings } from "@/hooks/useSettings";

type SubmissionSearch = {
  station?: string;
  edit?: string;
  uke?: string;
};

function SubmissionsPage() {
  const { station: stationId, edit: editId, uke } = Route.useSearch();
  const { data: settings, isLoading } = useSettings();

  if (!isLoading && !settings?.submissionsEnabled) return <Navigate to="/" replace />;

  return (
    <RequireAuth>
      <main className="flex-1 overflow-y-auto p-4 max-md:pb-16">
        <SubmissionForm
          preloadStationId={stationId ? Number.parseInt(stationId, 10) : undefined}
          editSubmissionId={editId ?? undefined}
          preloadUkeStationId={uke}
        />
      </main>
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
