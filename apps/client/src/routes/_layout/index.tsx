import { createFileRoute } from "@tanstack/react-router";

import MapView from "@/features/map/components/mapView";

function Page() {
  return (
    <div className="h-full min-h-0 flex-1">
      <MapView />
    </div>
  );
}

export const Route = createFileRoute("/_layout/")({
  component: Page,
  staticData: {
    titleKey: "items.mapView",
    i18nNamespace: "nav",
    mainClassName: "overflow-hidden max-md:pb-0",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
