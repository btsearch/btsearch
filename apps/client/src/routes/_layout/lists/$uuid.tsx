import { Navigate, createFileRoute } from "@tanstack/react-router";

import { ListMapView } from "@/features/lists/components/listMapView";
import { useSettings } from "@/hooks/useSettings";

function SharedListPage() {
  const { uuid } = Route.useParams();
  const { data: settings, isLoading } = useSettings();

  if (!isLoading && !settings?.enableUserLists) return <Navigate to="/" replace />;

  return (
    <div className="h-full min-h-0 flex-1">
      <ListMapView uuid={uuid} />
    </div>
  );
}

export const Route = createFileRoute("/_layout/lists/$uuid")({
  component: SharedListPage,
  staticData: {
    titleKey: "items.sharedList",
    i18nNamespace: "nav",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [{ titleKey: "sections.lists", i18nNamespace: "nav" }],
  },
});
