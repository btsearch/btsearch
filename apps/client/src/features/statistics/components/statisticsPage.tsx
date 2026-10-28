import type { CountryStatistics } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { Fragment, lazy } from "react";
import { useTranslation } from "react-i18next";

import {
  databaseBandsQueryOptions,
  databaseRegionsQueryOptions,
  databaseSummaryQueryOptions,
  observationStatisticsQueryOptions,
  photoRegionsQueryOptions,
  photoSummaryQueryOptions,
  registerBandsQueryOptions,
  registerRegionsQueryOptions,
  registerSummaryQueryOptions,
  useStatisticsRefetchError,
} from "../queries";
import { STATISTICS_SECTION_IDS } from "../sections";
import { SummarySkeleton } from "./blocks/summarySkeleton";
import { LazyMount } from "./card/lazyMount";
import { StatisticsCardSkeleton } from "./card/statisticsCard";
import { DatabaseCard } from "./database/databaseCard";
import { MeasurementsCard } from "./measurements/measurementsCard";
import { PhotosCard } from "./photos/photosCard";
import { QualityCard } from "./quality/qualityCard";
import { RegisterCard } from "./register/registerCard";
import { RegisterSources } from "./register/registerSources";
import { ErrorState, StaleDataNotice } from "@/components/ui/error-state";
import { type PageSection, useRegisterPageSections } from "@/contexts/pageSections";
import { countryStatisticsQueryOptions } from "@/features/map/statsApi";
import { useCountrySourceName } from "@/features/official/queries";
import { CountryPicker, pickCountry } from "@/features/shared/countryPicker";
import { countriesQueryOptions } from "@/features/shared/lookups";
import { useRememberedListCountries } from "@/features/stations/list/data/listCountryMemory";
import { useSettings } from "@/hooks/useSettings";

type StatisticsPageProps = {
  requestedCountryCode: string | null;
  onCountryChange: (countryCode: string) => void;
};

const PermitSnapshotCard = lazy(() => import("./snapshot/permitSnapshotCard").then((m) => ({ default: m.PermitSnapshotCard })));
const HistoryCard = lazy(() => import("./history/historyCard").then((m) => ({ default: m.HistoryCard })));
const MicrowaveLinksCard = lazy(() => import("./microwaveLinks/microwaveLinksCard").then((m) => ({ default: m.MicrowaveLinksCard })));

function countStatisticsData({ stations, official }: CountryStatistics): number {
  return stations.active + stations.awaitingCells + stations.inactive + (official?.permits ?? 0) + (official?.microwaveLinks ?? 0);
}

function indexCountriesWithData(statistics: readonly CountryStatistics[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of statistics) {
    const count = countStatisticsData(entry);
    if (count > 0) counts.set(entry.countryCode, count);
  }
  return counts;
}

export function StatisticsPage({ requestedCountryCode, onCountryChange }: StatisticsPageProps) {
  const { t } = useTranslation("statistics");
  const rememberedCountryCodes = useRememberedListCountries();
  const statisticsQuery = useQuery(countryStatisticsQueryOptions());
  const { data: countries } = useQuery(countriesQueryOptions());
  const { data: settings } = useSettings();

  const countriesWithData = statisticsQuery.data === undefined ? null : indexCountriesWithData(statisticsQuery.data);
  const countryCode = countriesWithData === null ? null : pickCountry(countriesWithData, requestedCountryCode, rememberedCountryCodes);
  const statistics = statisticsQuery.data?.find((entry) => entry.countryCode === countryCode);
  const country = countries?.find((entry) => entry.code === countryCode);
  const hasCountry = countryCode !== null;
  const hasRegister = country?.capabilities.official === true;
  const hasMicrowaveLinks = country?.capabilities.microwaveLinks === true;
  const areObservationsOn = settings?.features.observations === true;

  const databaseSummaryQuery = useQuery({ ...databaseSummaryQueryOptions(countryCode ?? ""), enabled: hasCountry });
  const databaseBandsQuery = useQuery({ ...databaseBandsQueryOptions(countryCode ?? ""), enabled: hasCountry });
  const databaseRegionsQuery = useQuery({ ...databaseRegionsQueryOptions(countryCode ?? ""), enabled: hasCountry });
  const photoSummaryQuery = useQuery({ ...photoSummaryQueryOptions(countryCode ?? ""), enabled: hasCountry });
  const photoRegionsQuery = useQuery({ ...photoRegionsQueryOptions(countryCode ?? ""), enabled: hasCountry });
  const registerSummaryQuery = useQuery({ ...registerSummaryQueryOptions(countryCode ?? ""), enabled: hasRegister });
  const registerBandsQuery = useQuery({ ...registerBandsQueryOptions(countryCode ?? ""), enabled: hasRegister });
  const registerRegionsQuery = useQuery({ ...registerRegionsQueryOptions(countryCode ?? ""), enabled: hasRegister });
  const observationsQuery = useQuery({ ...observationStatisticsQueryOptions(countryCode ?? ""), enabled: hasCountry && areObservationsOn });
  const sourceName = useCountrySourceName(countryCode);
  const linksSourceName = useCountrySourceName(countryCode, "microwaveLinks");

  const isObservationsCountry =
    observationsQuery.data === undefined ? country?.features.observationsPublic === true : observationsQuery.data !== null;
  const showsMeasurements = hasCountry && areObservationsOn && isObservationsCountry;
  const registerTitle = sourceName === null ? t("common:labels.permitRegister") : t("sections.register", { source: sourceName });
  const snapshotTitle = sourceName === null ? t("sections.registerSnapshot") : t("sections.permitSnapshot", { source: sourceName });
  const linksTitle = linksSourceName === null ? t("common:labels.radiolines") : t("sections.microwaveLinks", { source: linksSourceName });
  const refetchError = useStatisticsRefetchError();

  const sections: PageSection[] = [
    { id: STATISTICS_SECTION_IDS.database, title: t("main:stats.internalData") },
    { id: STATISTICS_SECTION_IDS.quality, title: t("sections.quality") },
    { id: STATISTICS_SECTION_IDS.photos, title: t("sections.photos") },
  ];
  if (showsMeasurements) sections.push({ id: STATISTICS_SECTION_IDS.measurements, title: t("settings:sections.measurements") });
  if (hasRegister) sections.push({ id: STATISTICS_SECTION_IDS.register, title: registerTitle });
  if (hasMicrowaveLinks) sections.push({ id: STATISTICS_SECTION_IDS.microwaveLinks, title: linksTitle });
  if (hasRegister) {
    sections.push({ id: STATISTICS_SECTION_IDS.snapshot, title: snapshotTitle }, { id: STATISTICS_SECTION_IDS.history, title: t("charts.history") });
  }
  useRegisterPageSections(sections);

  function renderContent() {
    if (statisticsQuery.isLoadingError) return <ErrorState onRetry={() => statisticsQuery.refetch()} isRetrying={statisticsQuery.isFetching} />;
    if (countriesWithData === null) {
      return (
        <>
          <StatisticsCardSkeleton id={STATISTICS_SECTION_IDS.database} title={t("main:stats.internalData")}>
            <SummarySkeleton />
          </StatisticsCardSkeleton>
          <StatisticsCardSkeleton id={STATISTICS_SECTION_IDS.quality} title={t("sections.quality")} />
        </>
      );
    }
    if (countryCode === null || statistics === undefined) return <ErrorState tone="neutral" title={t("common:empty.data")} />;

    return (
      <Fragment key={countryCode}>
        <DatabaseCard
          statistics={statistics}
          summaryQuery={databaseSummaryQuery}
          bandsQuery={databaseBandsQuery}
          regionsQuery={databaseRegionsQuery}
        />
        <QualityCard countryCode={countryCode} />
        <PhotosCard summaryQuery={photoSummaryQuery} regionsQuery={photoRegionsQuery} />
        {showsMeasurements ? <MeasurementsCard countryCode={countryCode} observationsQuery={observationsQuery} /> : null}
        {hasRegister ? (
          <RegisterCard
            title={registerTitle}
            statistics={statistics}
            summaryQuery={registerSummaryQuery}
            bandsQuery={registerBandsQuery}
            regionsQuery={registerRegionsQuery}
          />
        ) : null}
        {hasMicrowaveLinks ? (
          <LazyMount fallback={<StatisticsCardSkeleton id={STATISTICS_SECTION_IDS.microwaveLinks} title={linksTitle} />}>
            <MicrowaveLinksCard countryCode={countryCode} title={linksTitle} statistics={statistics} />
          </LazyMount>
        ) : null}
        {hasRegister ? (
          <>
            <LazyMount fallback={<StatisticsCardSkeleton id={STATISTICS_SECTION_IDS.snapshot} title={snapshotTitle} />}>
              <PermitSnapshotCard countryCode={countryCode} title={snapshotTitle} sourceName={sourceName} />
            </LazyMount>
            <LazyMount fallback={<StatisticsCardSkeleton id={STATISTICS_SECTION_IDS.history} title={t("charts.history")} />}>
              <HistoryCard countryCode={countryCode} />
            </LazyMount>
            <RegisterSources countryCode={countryCode} />
          </>
        ) : null}
      </Fragment>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
      <div className="w-full space-y-5 sm:space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("nav:items.statistics")}</h1>
            {refetchError.hasRefetchError ? (
              <StaleDataNotice className="mt-3" onRetry={refetchError.retry} isRetrying={refetchError.isRetrying} />
            ) : null}
          </div>
          {countryCode === null ? null : (
            <CountryPicker countryCodes={[...(countriesWithData?.keys() ?? [])]} value={countryCode} onChange={onCountryChange} />
          )}
        </header>
        {renderContent()}
      </div>
    </main>
  );
}
