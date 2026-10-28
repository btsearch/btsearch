import { useQuery } from "@tanstack/react-query";
import { lazy } from "react";
import { useTranslation } from "react-i18next";

import { completenessQueryOptions } from "../../queries";
import { STATISTICS_SECTION_IDS } from "../../sections";
import { LazyMount } from "../card/lazyMount";
import { QueryState } from "../card/queryState";
import { BLOCK_PADDING_CLASS, CardBlock, SplitBlock, StatisticsCard } from "../card/statisticsCard";
import { ChartBlockSkeleton } from "../charts/chartBody";
import { CompletenessMeters, CompletenessMetersSkeleton } from "./completenessMeters";

const ContributionsChart = lazy(() => import("./contributionsChart").then((m) => ({ default: m.ContributionsChart })));
const AnalyzerUsageChart = lazy(() => import("./analyzerUsageChart").then((m) => ({ default: m.AnalyzerUsageChart })));

const CONTRIBUTIONS_SKELETON_HEIGHT = "h-80";
const ANALYZER_SKELETON_HEIGHT = "h-72";

export function QualityCard({ countryCode }: { countryCode: string }) {
  const { t } = useTranslation("statistics");
  const completenessQuery = useQuery(completenessQueryOptions(countryCode));

  return (
    <StatisticsCard id={STATISTICS_SECTION_IDS.quality} title={t("sections.quality")}>
      <CardBlock>
        <QueryState query={completenessQuery} skeleton={<CompletenessMetersSkeleton />}>
          {(completeness) => <CompletenessMeters completeness={completeness} />}
        </QueryState>
      </CardBlock>
      <SplitBlock>
        <div className={BLOCK_PADDING_CLASS}>
          <LazyMount fallback={<ChartBlockSkeleton heightClassName={CONTRIBUTIONS_SKELETON_HEIGHT} />}>
            <ContributionsChart countryCode={countryCode} />
          </LazyMount>
        </div>
        <div className={BLOCK_PADDING_CLASS}>
          <LazyMount fallback={<ChartBlockSkeleton heightClassName={ANALYZER_SKELETON_HEIGHT} />}>
            <AnalyzerUsageChart />
          </LazyMount>
        </div>
      </SplitBlock>
    </StatisticsCard>
  );
}
