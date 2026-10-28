import type { CountryStatistics } from "@openbts/shared/contract";
import type { UseQueryResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { DatabaseSummary, StackedRow } from "../../lib/chartData";
import { formatPercent } from "../../lib/format";
import { STATISTICS_SECTION_IDS } from "../../sections";
import { NumberStrip, type NumberTile } from "../blocks/numberStrip";
import { OperatorShares } from "../blocks/operatorShares";
import { StackedRows, StackedRowsSkeleton } from "../blocks/stackedRows";
import { SummarySkeleton } from "../blocks/summarySkeleton";
import { QueryState } from "../card/queryState";
import { BLOCK_PADDING_CLASS, CARD_BLOCK_CLASS, CardBlock, SplitBlock, StatisticsCard } from "../card/statisticsCard";
import { RAT_CELL_SPECS } from "@/features/shared/rat";
import { toRatType } from "@/features/station-details/station/utils/bands";
import { formatDateTime } from "@/lib/format";

type DatabaseCardProps = {
  statistics: CountryStatistics;
  summaryQuery: UseQueryResult<DatabaseSummary>;
  bandsQuery: UseQueryResult<StackedRow[]>;
  regionsQuery: UseQueryResult<StackedRow[]>;
};

function useDatabaseTiles(statistics: CountryStatistics, summary: DatabaseSummary): NumberTile[] {
  const { t, i18n } = useTranslation("statistics");
  const { awaitingCells, inactive } = statistics.stations;

  return [
    {
      key: "stations",
      label: t("kpi.totalInternalStations"),
      value: summary.stations,
      hint: `${t("database.withoutCells", { count: awaitingCells })} · ${t("database.inactive", { count: inactive })}`,
      isPrimary: true,
    },
    { key: "cells", label: t("kpi.totalCells"), value: summary.cells, isPrimary: true },
    { key: "locations", label: t("kpi.locations"), value: statistics.locations, isPrimary: true },
    ...summary.rats.map((rat) => ({
      key: rat.rat,
      label: rat.label,
      generation: RAT_CELL_SPECS[toRatType(rat.rat)].gen,
      value: rat.cells,
      hint: `${formatPercent(rat.sharePct, i18n.language)} · ${t("common:labels.stations", { count: rat.stations })}`,
    })),
  ];
}

function DatabaseNumbers({ statistics, summary }: { statistics: CountryStatistics; summary: DatabaseSummary }) {
  const { t } = useTranslation("statistics");
  const tiles = useDatabaseTiles(statistics, summary);

  return (
    <>
      <CardBlock>
        <NumberStrip tiles={tiles} />
      </CardBlock>
      <CardBlock>
        <OperatorShares
          title={t("charts.internalStationsPerOperator")}
          counts={summary.operators.map((row) => ({ operator: row.operator, value: row.stations }))}
        />
      </CardBlock>
    </>
  );
}

export function DatabaseCard({ statistics, summaryQuery, bandsQuery, regionsQuery }: DatabaseCardProps) {
  const { t, i18n } = useTranslation("statistics");
  const note = statistics.updatedAt === null ? undefined : t("database.updatedAt", { date: formatDateTime(statistics.updatedAt, i18n.language) });

  return (
    <StatisticsCard id={STATISTICS_SECTION_IDS.database} title={t("main:stats.internalData")} note={note}>
      <QueryState query={summaryQuery} skeleton={<SummarySkeleton />} errorClassName={CARD_BLOCK_CLASS}>
        {(summary) => <DatabaseNumbers statistics={statistics} summary={summary} />}
      </QueryState>
      <SplitBlock>
        <div className={BLOCK_PADDING_CLASS}>
          <QueryState query={bandsQuery} skeleton={<StackedRowsSkeleton />}>
            {(bands) => <StackedRows title={t("charts.internalStationsByBand")} rows={bands} labelWidth="band" />}
          </QueryState>
        </div>
        <div className={BLOCK_PADDING_CLASS}>
          <QueryState query={regionsQuery} skeleton={<StackedRowsSkeleton />}>
            {(regions) => <StackedRows title={t("charts.internalByRegion")} rows={regions} labelWidth="region" />}
          </QueryState>
        </div>
      </SplitBlock>
    </StatisticsCard>
  );
}
