import type { ObservationStatistics } from "@openbts/shared/contract";
import { type UseQueryResult, usePrefetchQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { currentMonth, toMonthStart } from "../../lib/periods";
import { leaderboardQueryOptions } from "../../queries";
import { STATISTICS_SECTION_IDS } from "../../sections";
import { NumberStrip, NumberStripSkeleton, type NumberTile } from "../blocks/numberStrip";
import { QueryState } from "../card/queryState";
import { BLOCK_PADDING_CLASS, CARD_BLOCK_CLASS, CardBlock, EmptyBlock, SplitBlock, StatisticsCard } from "../card/statisticsCard";
import { ChartBlockSkeleton } from "../charts/chartBody";
import { Leaderboard, OwnStandingPrefetch } from "./leaderboard";
import { MeasuredSites } from "./measuredSites";
import { ReadingsChart } from "./readingsChart";
import { useSettledSession } from "@/hooks/useSettledSession";
import { formatShortUtcDate } from "@/lib/format";

type MeasurementsCardProps = { countryCode: string; observationsQuery: UseQueryResult<ObservationStatistics | null> };

const AREA_FORMAT: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

function hasMeasurements(observations: ObservationStatistics | null): observations is ObservationStatistics {
  return observations !== null && (observations.squares > 0 || observations.observedCells > 0);
}

function useMeasurementTiles(observations: ObservationStatistics): NumberTile[] {
  const { t, i18n } = useTranslation("statistics");
  const { sites } = observations;
  const thisMonth = observations.months.at(-1);
  const people = thisMonth?.people ?? null;

  return [
    {
      key: "squares",
      label: t("measurements.squares"),
      value: observations.squares,
      hint: t("measurements.area", { area: observations.areaSquareKilometers.toLocaleString(i18n.language, AREA_FORMAT) }),
      isPrimary: true,
    },
    { key: "cells", label: t("measurements.cells"), value: observations.observedCells, isPrimary: true },
    {
      key: "sites",
      label: t("measurements.sites"),
      value: sites.matched + sites.suggested + sites.unmatched,
      hint: t("measurements.unmatchedCount", { count: sites.unmatched }),
      isPrimary: true,
    },
    {
      key: "readings",
      label: t("measurements.readingsThisMonth"),
      value: thisMonth?.samples ?? null,
      hint: people === null ? t("measurements.fewPeople") : t("stationDetails:measurements.people", { count: people }),
      isPrimary: true,
    },
  ];
}

function MeasurementsContent({ countryCode, observations }: { countryCode: string; observations: ObservationStatistics }) {
  const tiles = useMeasurementTiles(observations);

  return (
    <>
      <CardBlock>
        <NumberStrip tiles={tiles} />
      </CardBlock>
      <SplitBlock>
        <div className={BLOCK_PADDING_CLASS}>
          <Leaderboard countryCode={countryCode} />
        </div>
        <div className="divide-y">
          <div className={BLOCK_PADDING_CLASS}>
            <ReadingsChart months={observations.months} />
          </div>
          <div className={BLOCK_PADDING_CLASS}>
            <MeasuredSites sites={observations.sites} />
          </div>
        </div>
      </SplitBlock>
    </>
  );
}

function MeasurementsSkeleton() {
  return (
    <>
      <CardBlock>
        <NumberStripSkeleton />
      </CardBlock>
      <SplitBlock>
        <div className={BLOCK_PADDING_CLASS}>
          <ChartBlockSkeleton heightClassName="h-80" />
        </div>
        <div className={BLOCK_PADDING_CLASS}>
          <ChartBlockSkeleton heightClassName="h-80" />
        </div>
      </SplitBlock>
    </>
  );
}

export function MeasurementsCard({ countryCode, observationsQuery }: MeasurementsCardProps) {
  const { t, i18n } = useTranslation("statistics");
  const { data: session } = useSettledSession();
  const userId = session?.user?.id ?? null;
  usePrefetchQuery(leaderboardQueryOptions(countryCode, toMonthStart(currentMonth())));
  const lastMeasuredOn = observationsQuery.data?.lastMeasuredOn ?? null;
  const note = lastMeasuredOn === null ? undefined : t("measurements.lastMeasuredOn", { date: formatShortUtcDate(lastMeasuredOn, i18n.language) });

  return (
    <StatisticsCard id={STATISTICS_SECTION_IDS.measurements} title={t("settings:sections.measurements")} note={note}>
      {userId === null ? null : <OwnStandingPrefetch userId={userId} />}
      <QueryState query={observationsQuery} skeleton={<MeasurementsSkeleton />} errorClassName={CARD_BLOCK_CLASS}>
        {(observations) =>
          hasMeasurements(observations) ? (
            <MeasurementsContent countryCode={countryCode} observations={observations} />
          ) : (
            <div className="border-t">
              <EmptyBlock title={t("measurements.emptyTitle")} description={t("measurements.emptyDescription")} />
            </div>
          )
        }
      </QueryState>
    </StatisticsCard>
  );
}
