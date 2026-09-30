import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

import { statsCompletenessQueryOptions } from "../queries";
import { StatChartCard } from "./statChartCard";

export function CompletenessCharts() {
  const { t } = useTranslation("statistics");
  const { data, isLoading, isLoadingError, isFetching, refetch } = useQuery(statsCompletenessQueryOptions());

  const stationData = useMemo(
    () => [
      {
        metric: t("common:labels.stations"),
        withSectors: data?.stations.withSectors ?? 0,
        withExtraIds: data?.stations.withExtraIds ?? 0,
        withoutSectors: Math.max((data?.stations.total ?? 0) - (data?.stations.withSectors ?? 0), 0),
        withoutExtraIds: Math.max((data?.stations.total ?? 0) - (data?.stations.withExtraIds ?? 0), 0),
      },
    ],
    [data, t],
  );

  const pciData = useMemo(
    () => [
      {
        rat: "LTE",
        documented: data?.cells.lte.documented ?? 0,
        missing: data?.cells.lte.missing ?? 0,
      },
      {
        rat: "NR",
        documented: data?.cells.nr.documented ?? 0,
        missing: data?.cells.nr.missing ?? 0,
      },
    ],
    [data],
  );

  const stationSeries = useMemo(
    () => [
      { key: "withSectors", label: t("completeness.withSectors"), color: "var(--chart-1)" },
      { key: "withoutSectors", label: t("completeness.withoutSectors"), color: "var(--chart-2)" },
      { key: "withExtraIds", label: t("completeness.withExtraIds"), color: "var(--chart-3)" },
      { key: "withoutExtraIds", label: t("completeness.withoutExtraIds"), color: "var(--chart-4)" },
    ],
    [t],
  );

  const pciSeries = useMemo(
    () => [
      { key: "documented", label: t("completeness.documented"), color: "var(--chart-1)" },
      { key: "missing", label: t("completeness.missing"), color: "var(--chart-5)" },
    ],
    [t],
  );

  return (
    <div className="relative border border-border">
      <div className="grid grid-cols-1 divide-y divide-border lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <StatChartCard
          title={t("completeness.stationTitle")}
          description={t("completeness.stationDescription")}
          data={stationData}
          series={stationSeries}
          dataXKey="metric"
          stacked
          isLoading={isLoading}
          standalone={false}
          isError={isLoadingError}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
        <StatChartCard
          title={t("completeness.pciTitle")}
          description={t("completeness.pciDescription")}
          data={pciData}
          series={pciSeries}
          dataXKey="rat"
          stacked
          isLoading={isLoading}
          standalone={false}
          isError={isLoadingError}
          onRetry={() => refetch()}
          isRetrying={isFetching}
        />
      </div>
    </div>
  );
}
