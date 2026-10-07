import { useTranslation } from "react-i18next";

import type { StationsListPage } from "@/features/stations/list/data/stationsListQueries";

type StationsListCountProps = {
  page: StationsListPage;
};

export function StationsListCount({ page }: StationsListCountProps) {
  const { t } = useTranslation("stations");

  if (page.total === null) return null;

  return (
    <>
      {t("common:labels.stations", { count: page.total })}
      {page.isByRelevance ? (
        <>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, </span>
          {t("list.byRelevance")}
        </>
      ) : null}
    </>
  );
}
