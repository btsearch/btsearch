import type { UseQueryResult } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import type { PhotoSummary, StackedRow } from "../../lib/chartData";
import { STATISTICS_SECTION_IDS } from "../../sections";
import { NumberStrip, type NumberTile } from "../blocks/numberStrip";
import { OperatorShares } from "../blocks/operatorShares";
import { StackedRows, StackedRowsSkeleton } from "../blocks/stackedRows";
import { SummarySkeleton } from "../blocks/summarySkeleton";
import { QueryState } from "../card/queryState";
import { CARD_BLOCK_CLASS, CardBlock, StatisticsCard } from "../card/statisticsCard";

type PhotosCardProps = {
  summaryQuery: UseQueryResult<PhotoSummary>;
  regionsQuery: UseQueryResult<StackedRow[]>;
};

function PhotoNumbers({ summary }: { summary: PhotoSummary }) {
  const { t } = useTranslation("statistics");
  const tiles: NumberTile[] = [{ key: "photos", label: t("kpi.totalPhotos"), value: summary.photos, isPrimary: true }];

  return (
    <>
      <CardBlock>
        <NumberStrip tiles={tiles} />
      </CardBlock>
      <CardBlock>
        <OperatorShares title={t("charts.photosPerOperator")} counts={summary.operators} />
      </CardBlock>
    </>
  );
}

export function PhotosCard({ summaryQuery, regionsQuery }: PhotosCardProps) {
  const { t } = useTranslation("statistics");

  return (
    <StatisticsCard id={STATISTICS_SECTION_IDS.photos} title={t("sections.photos")}>
      <QueryState query={summaryQuery} skeleton={<SummarySkeleton />} errorClassName={CARD_BLOCK_CLASS}>
        {(summary) => <PhotoNumbers summary={summary} />}
      </QueryState>
      <CardBlock>
        <QueryState query={regionsQuery} skeleton={<StackedRowsSkeleton />}>
          {(regions) => <StackedRows title={t("charts.photosByRegion")} rows={regions} labelWidth="region" />}
        </QueryState>
      </CardBlock>
    </StatisticsCard>
  );
}
