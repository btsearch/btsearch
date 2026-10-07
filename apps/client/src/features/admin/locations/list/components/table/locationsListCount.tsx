import { useTranslation } from "react-i18next";

import type { LocationsListPage } from "@/features/admin/locations/list/data/locationsListQueries";

type LocationsListCountProps = {
  page: LocationsListPage;
};

export function LocationsListCount({ page }: LocationsListCountProps) {
  const { t } = useTranslation("admin");

  if (page.total === null) return null;

  return <>{t("auditLogs.counts.locations", { count: page.total })}</>;
}
