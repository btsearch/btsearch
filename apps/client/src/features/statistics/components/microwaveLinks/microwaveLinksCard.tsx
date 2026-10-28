import { Calendar03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CountryStatistics } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { formatPercent, toPercent } from "../../lib/format";
import {
  type MicrowaveLinkSummary,
  type MicrowaveLinkTrend,
  findPreviousMonthChange,
  hasKnownBucket,
  listBandBuckets,
  listCapacityBuckets,
  listLengthBuckets,
  listLinkRows,
  listLinkShares,
  listTypeBuckets,
  listVendorRows,
  sumMicrowaveLinks,
} from "../../lib/microwaveLinks";
import { createOthersOperator } from "../../lib/operators";
import { defaultPeriod, toMonthEnd } from "../../lib/periods";
import { microwaveLinkHistoryQueryOptions, microwaveLinksQueryOptions } from "../../queries";
import { STATISTICS_SECTION_IDS } from "../../sections";
import { NumberStrip, type NumberTile } from "../blocks/numberStrip";
import { OperatorShares } from "../blocks/operatorShares";
import { StackedRows, StackedRowsSkeleton } from "../blocks/stackedRows";
import { SummarySkeleton } from "../blocks/summarySkeleton";
import { QueryState } from "../card/queryState";
import {
  BLOCK_DESCRIPTION_CLASS,
  BLOCK_PADDING_CLASS,
  CARD_BLOCK_CLASS,
  CardBlock,
  EmptyBlock,
  SplitBlock,
  StatisticsCard,
} from "../card/statisticsCard";
import { MicrowaveLinksHistory, MicrowaveLinksHistorySkeleton } from "./microwaveLinksHistory";
import { VendorLegend } from "./vendorLegend";
import { formatDistance, formatShortDate, formatShortUtcDate } from "@/lib/format";

type MicrowaveLinksCardProps = { countryCode: string; title: string; statistics: CountryStatistics };
type MicrowaveLinksContentProps = {
  countryCode: string;
  summary: MicrowaveLinkSummary;
  trend: MicrowaveLinkTrend | undefined;
  registerEntries: number | null;
};

function SpecsDateTag({ specsAsOf }: { specsAsOf: string }) {
  const { t, i18n } = useTranslation("statistics");

  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-md bg-muted px-2 text-xs font-medium whitespace-nowrap text-muted-foreground">
      <HugeiconsIcon icon={Calendar03Icon} className="size-3.5" aria-hidden="true" />
      {t("microwaveLinks.specsAsOf", { date: formatShortDate(specsAsOf, i18n.language) })}
    </span>
  );
}

function MicrowaveLinksContent({ countryCode, summary, trend, registerEntries }: MicrowaveLinksContentProps) {
  const { t, i18n } = useTranslation("statistics");
  const { counts, specsAsOf } = summary;
  const totals = sumMicrowaveLinks(counts);
  const change = trend === undefined ? undefined : findPreviousMonthChange(trend, totals.links, summary.startsOn);
  const others = createOthersOperator(t("microwaveLinks.otherOperators"));
  const specsTag = specsAsOf === null ? undefined : <SpecsDateTag specsAsOf={specsAsOf} />;

  function describeChange(): string | undefined {
    if (change === undefined) return undefined;
    if (change === null) return t("microwaveLinks.noPreviousMonth");
    return t("microwaveLinks.comparedWith", { date: formatShortUtcDate(toMonthEnd(change.previousMonth), i18n.language) });
  }

  const tiles: NumberTile[] = [
    {
      key: "links",
      label: t("common:labels.radiolines"),
      value: totals.links,
      hint: registerEntries === null ? undefined : t("microwaveLinks.registerEntries", { count: registerEntries }),
      isPrimary: true,
    },
    { key: "change", label: t("microwaveLinks.change"), value: change?.change ?? null, isSigned: true, hint: describeChange(), isPrimary: true },
    {
      key: "eBand",
      label: t("microwaveLinks.eBand"),
      value: formatPercent(toPercent(totals.eBandLinks, totals.links), i18n.language),
      hint: t("microwaveLinks.links", { count: totals.eBandLinks }),
      isPrimary: true,
    },
    {
      key: "averageLength",
      label: t("microwaveLinks.averageLength"),
      value: totals.links === 0 ? null : formatDistance(totals.totalLengthMeters / totals.links, i18n.language),
      isPrimary: true,
    },
  ];

  const bands = (
    <StackedRows
      title={t("microwaveLinks.byBand")}
      rows={listLinkRows(counts, "band", listBandBuckets(t("common:labels.other")), others)}
      labelWidth="band"
    />
  );
  const lengths = (
    <StackedRows
      title={t("microwaveLinks.byLength")}
      rows={listLinkRows(counts, "length", listLengthBuckets(i18n.language), others)}
      labelWidth="band"
    />
  );
  const types = (
    <StackedRows
      title={t("microwaveLinks.byType")}
      rows={listLinkRows(counts, "type", listTypeBuckets(t("common:labels.other")), others)}
      labelWidth="band"
    />
  );

  function renderVendors() {
    const vendors = listVendorRows(counts, others, { otherVendors: t("microwaveLinks.otherVendors"), unknown: t("common:labels.unknown") });
    return (
      <StackedRows
        title={t("microwaveLinks.vendors")}
        description={specsAsOf === null ? undefined : t("microwaveLinks.vendorsDescription")}
        note={specsTag}
        legend={<VendorLegend vendors={vendors.vendors} />}
        rows={vendors.rows}
        labelWidth="region"
        fillsWidth
      />
    );
  }

  return (
    <>
      <CardBlock>
        <NumberStrip tiles={tiles} />
      </CardBlock>
      <CardBlock>
        <OperatorShares title={t("microwaveLinks.byOperator")} counts={listLinkShares(counts, others)} />
      </CardBlock>
      {hasKnownBucket(counts, "capacity") ? (
        <>
          <SplitBlock>
            <div className={BLOCK_PADDING_CLASS}>{bands}</div>
            <div className={BLOCK_PADDING_CLASS}>{lengths}</div>
          </SplitBlock>
          <SplitBlock>
            <div className={BLOCK_PADDING_CLASS}>{types}</div>
            <div className={BLOCK_PADDING_CLASS}>
              <StackedRows
                title={t("microwaveLinks.byCapacity")}
                description={t("microwaveLinks.capacityDescription")}
                note={specsTag}
                rows={listLinkRows(counts, "capacity", listCapacityBuckets(i18n.language, t("microwaveLinks.unknownCapacity")), others)}
                labelWidth="region"
              />
            </div>
          </SplitBlock>
        </>
      ) : (
        <>
          <SplitBlock>
            <div className={BLOCK_PADDING_CLASS}>{bands}</div>
            <div className={BLOCK_PADDING_CLASS}>{types}</div>
          </SplitBlock>
          <CardBlock>{lengths}</CardBlock>
        </>
      )}
      {hasKnownBucket(counts, "vendor") ? <CardBlock>{renderVendors()}</CardBlock> : null}
      <CardBlock>
        <MicrowaveLinksHistory countryCode={countryCode} others={others} startDate={formatShortDate(summary.takenAt, i18n.language)} />
      </CardBlock>
      <p className="border-t px-4 py-3 text-xs text-muted-foreground sm:px-5">{summary.attributions.join(" ")}</p>
    </>
  );
}

function MicrowaveLinksSkeleton() {
  return (
    <>
      <SummarySkeleton />
      <SplitBlock>
        <div className={BLOCK_PADDING_CLASS}>
          <StackedRowsSkeleton />
        </div>
        <div className={BLOCK_PADDING_CLASS}>
          <StackedRowsSkeleton />
        </div>
      </SplitBlock>
      <SplitBlock>
        <div className={BLOCK_PADDING_CLASS}>
          <StackedRowsSkeleton />
        </div>
        <div className={BLOCK_PADDING_CLASS}>
          <StackedRowsSkeleton />
        </div>
      </SplitBlock>
      <CardBlock>
        <StackedRowsSkeleton />
      </CardBlock>
      <CardBlock>
        <MicrowaveLinksHistorySkeleton />
      </CardBlock>
    </>
  );
}

export function MicrowaveLinksCard({ countryCode, title, statistics }: MicrowaveLinksCardProps) {
  const { t, i18n } = useTranslation("statistics");
  const summaryQuery = useQuery(microwaveLinksQueryOptions(countryCode));
  const { data: trend } = useQuery(microwaveLinkHistoryQueryOptions(countryCode, defaultPeriod("monthly")));
  const importedAt = statistics.official?.microwaveLinksImportedAt ?? null;
  const dataDate = importedAt === null ? null : formatShortDate(importedAt, i18n.language);

  return (
    <StatisticsCard
      id={STATISTICS_SECTION_IDS.microwaveLinks}
      title={title}
      description={<p className={BLOCK_DESCRIPTION_CLASS}>{t("microwaveLinks.description")}</p>}
      note={dataDate === null ? undefined : t("register.dataFrom", { date: dataDate })}
    >
      <QueryState query={summaryQuery} skeleton={<MicrowaveLinksSkeleton />} errorClassName={CARD_BLOCK_CLASS}>
        {(summary) =>
          summary === null ? (
            <div className="border-t">
              <EmptyBlock />
            </div>
          ) : (
            <MicrowaveLinksContent
              countryCode={countryCode}
              summary={summary}
              trend={trend}
              registerEntries={statistics.official?.microwaveLinks ?? null}
            />
          )
        }
      </QueryState>
    </StatisticsCard>
  );
}
