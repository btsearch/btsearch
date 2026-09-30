import { Navigate, createFileRoute } from "@tanstack/react-router";

import { RequireAuth } from "@/components/auth/requireAuth";
import { PageErrorState } from "@/components/ui/error-state";
import { ListsPageContent } from "@/features/lists/components/listsPage";
import { useFeatureGate } from "@/hooks/useFeatureGate";

function ListsPage() {
  const { hasLoadError, isDisabled, isRetrying, retry } = useFeatureGate("enableUserLists");

  if (hasLoadError) return <PageErrorState onRetry={() => retry()} isRetrying={isRetrying} />;
  if (isDisabled) return <Navigate to="/" replace />;

  return (
    <RequireAuth>
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <ListsPageContent />
      </main>
    </RequireAuth>
  );
}

export const Route = createFileRoute("/_layout/lists/")({
  component: ListsPage,
  staticData: {
    titleKey: "sections.lists",
    i18nNamespace: "nav",
  },
});
