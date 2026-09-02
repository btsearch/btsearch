import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { useFloatingDialogStack } from "@/features/station-details/components/floatingDialogStackProvider";
import { StationsListLayout } from "@/features/stations/components/stationsFilterLayout";
import { useStationsData } from "@/features/stations/hooks/useStationsData";
import { buildStaticPageHead } from "@/lib/seo";
import type { Station } from "@/types/station";

function StationsListPage() {
  const { openStationDialog } = useFloatingDialogStack();
  const data = useStationsData();
  const handleRowClick = useCallback((station: Station) => openStationDialog(station.id, "internal"), [openStationDialog]);
  const getRowHref = useCallback((station: Station) => `/stations/${station.id}`, []);

  return <StationsListLayout data={data} onRowClick={handleRowClick} getRowHref={getRowHref} />;
}

export const Route = createFileRoute("/_layout/stations")({
  component: StationsListPage,
  head: () => buildStaticPageHead("/stations"),
  staticData: {
    titleKey: "items.database",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
