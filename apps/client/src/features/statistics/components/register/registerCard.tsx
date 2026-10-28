import type { CountryStatistics } from "@openbts/shared/contract";
import type { UseQueryResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { RegisterSummary, StackedRow } from "../../lib/chartData";
import { formatPercent } from "../../lib/format";
import { STATISTICS_SECTION_IDS } from "../../sections";
import { NumberStrip, type NumberTile } from "../blocks/numberStrip";
import { OperatorShares } from "../blocks/operatorShares";
import { StackedRows, StackedRowsSkeleton } from "../blocks/stackedRows";
import { SummarySkeleton } from "../blocks/summarySkeleton";
import { QueryState } from "../card/queryState";
import { BLOCK_PADDING_CLASS, CARD_BLOCK_CLASS, CardBlock, SplitBlock, StatisticsCard } from "../card/statisticsCard";
import { toOfficialRatOption } from "@/features/official/labels";
import { formatShortDate } from "@/lib/format";

type RegisterCardProps = {
  title: string;
  statistics: CountryStatistics;
  summaryQuery: UseQueryResult<RegisterSummary>;
  bandsQuery: UseQueryResult<StackedRow[]>;
  regionsQuery: UseQueryResult<StackedRow[]>;
};

function useRegisterTiles(statistics: CountryStatistics, summary: RegisterSummary): NumberTile[] {
  const { t, i18n } = useTranslation("statistics");

  return [
    { key: "permits", label: t("kpi.totalPermits"), value: summary.permits, isPrimary: true },
    { key: "sites", label: t("kpi.totalStations"), value: summary.sites, isPrimary: true },
    { key: "locations", label: t("kpi.locations"), value: statistics.official?.locations ?? null, isPrimary: true },
    ...summary.rats.map((rat) => ({
      key: rat.rat,
      label: rat.label,
      generation: toOfficialRatOption(rat.rat).gen,
      value: rat.sites,
      hint: `${formatPercent(rat.sharePct, i18n.language)} · ${t("stationDetails:permits.permitsCount", { count: rat.permits })}`,
    })),
  ];
}

function RegisterNumbers({ statistics, summary }: { statistics: CountryStatistics; summary: RegisterSummary }) {
  const { t } = useTranslation("statistics");
  const tiles = useRegisterTiles(statistics, summary);

  return (
    <>
      <CardBlock>
        <NumberStrip tiles={tiles} />
      </CardBlock>
      <CardBlock>
        <OperatorShares title={t("charts.byOperator")} counts={summary.operators.map((row) => ({ operator: row.operator, value: row.sites }))} />
      </CardBlock>
    </>
  );
}

export function RegisterCard({ title, statistics, summaryQuery, bandsQuery, regionsQuery }: RegisterCardProps) {
  const { t, i18n } = useTranslation("statistics");
  const importedAt = statistics.official?.permitsImportedAt ?? null;
  const note = importedAt === null ? undefined : t("register.dataFrom", { date: formatShortDate(importedAt, i18n.language) });

  return (
    <StatisticsCard id={STATISTICS_SECTION_IDS.register} title={title} note={note}>
      <QueryState query={summaryQuery} skeleton={<SummarySkeleton />} errorClassName={CARD_BLOCK_CLASS}>
        {(summary) => <RegisterNumbers statistics={statistics} summary={summary} />}
      </QueryState>
      <SplitBlock>
        <div className={BLOCK_PADDING_CLASS}>
          <QueryState query={bandsQuery} skeleton={<StackedRowsSkeleton />}>
            {(bands) => <StackedRows title={t("charts.byBand")} rows={bands} labelWidth="band" />}
          </QueryState>
        </div>
        <div className={BLOCK_PADDING_CLASS}>
          <QueryState query={regionsQuery} skeleton={<StackedRowsSkeleton />}>
            {(regions) => <StackedRows title={t("charts.byRegion")} rows={regions} labelWidth="region" />}
          </QueryState>
        </div>
      </SplitBlock>
    </StatisticsCard>
  );
}
