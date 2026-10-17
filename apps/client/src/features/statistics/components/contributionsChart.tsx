import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { type Granularity, contributionsQueryOptions } from "../queries";
import { GranularitySelect } from "./granularitySelect";
import { StatChartCard } from "./statChartCard";

export function ContributionsChart() {
  const { t } = useTranslation("statistics");
  const [granularity, setGranularity] = useState<Granularity>("monthly");
  const { data, isLoading, isLoadingError, isFetching, refetch } = useQuery(contributionsQueryOptions(granularity));
  const chartData = useMemo(
    () =>
      data?.map((point) => ({
        date: point.date,
        addedSectors: point.sectors,
        addedExtraIds: point.identifiers,
        addedCellsWithPCI: point.cellsWithPci,
      })) ?? [],
    [data],
  );

  const series = useMemo(
    () => [
      { key: "addedSectors", label: t("contributions.addedSectors"), color: "var(--chart-1)" },
      { key: "addedExtraIds", label: t("contributions.addedExtraIds"), color: "var(--chart-2)" },
      { key: "addedCellsWithPCI", label: t("contributions.addedCellsWithPCI"), color: "var(--chart-3)" },
    ],
    [t],
  );

  return (
    <StatChartCard
      title={t("contributions.title")}
      description={t("contributions.description")}
      toolbar={<GranularitySelect value={granularity} onChange={setGranularity} />}
      data={chartData}
      series={series}
      dataXKey="date"
      stacked
      height="h-80"
      showBrush
      isLoading={isLoading}
      isError={isLoadingError}
      onRetry={() => refetch()}
      isRetrying={isFetching}
    />
  );
}
