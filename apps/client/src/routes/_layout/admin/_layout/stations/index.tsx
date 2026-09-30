import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { StationsListLayout } from "@/features/stations/components/stationsFilterLayout";
import { useStationsData } from "@/features/stations/hooks/useStationsData";
import type { Station } from "@/types/station";

function AdminStationsListPage() {
  const { t } = useTranslation("stations");
  const navigate = useNavigate();
  const data = useStationsData();
  const handleRowClick = useCallback(
    (station: Station) => navigate({ to: "/admin/stations/$id", params: { id: String(station.id) }, search: { uke: undefined } }),
    [navigate],
  );
  const getRowHref = useCallback((station: Station) => `/admin/stations/${station.id}`, []);

  return (
    <StationsListLayout
      data={data}
      onRowClick={handleRowClick}
      getRowHref={getRowHref}
      headerActions={
        <Button size="sm" onClick={() => navigate({ to: "/admin/stations/$id", params: { id: "new" }, search: { uke: undefined } })}>
          <HugeiconsIcon icon={Add01Icon} className="size-4 sm:mr-0.5" />
          <span className="hidden sm:inline">{t("actions.newStation")}</span>
        </Button>
      }
    />
  );
}

export const Route = createFileRoute("/_layout/admin/_layout/stations/")({
  component: AdminStationsListPage,
  staticData: {
    titleKey: "items.stations",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.admin", i18nNamespace: "nav" }],
    allowedRoles: ["admin", "editor"],
  },
});
