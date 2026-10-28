import { ArrowUpRight01Icon, FullSignalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Fragment, type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";

import { sourceLink } from "../format";
import { type SpectrumGroup, buildCountrySpectrum, countHoldingsByCountry, getLocalDay } from "../model";
import { spectrumHoldingsWithOperatorQueryOptions } from "../queries";
import { SpectrumBandCard } from "./spectrumBandCard";
import { SpectrumSummary } from "./spectrumSummary";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { CountryPicker, pickCountry } from "@/features/shared/countryPicker";
import { bandsQueryOptions, brandsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { useRememberedListCountries } from "@/features/stations/list/data/listCountryMemory";

type SpectrumPageProps = {
  requestedCountryCode: string | null;
  onCountryChange: (countryCode: string) => void;
};

const GROUPS: readonly SpectrumGroup[] = ["low", "mid", "high"];

function SectionDivider({ id, title }: { id: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <h2 id={id} className="text-xs font-semibold whitespace-nowrap uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

function PageSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <SectionDivider id={id} title={title} />
      {children}
    </section>
  );
}

function SpectrumSkeleton() {
  return (
    <div className="space-y-6" aria-hidden="true">
      <Skeleton className="h-60 w-full rounded-lg" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  );
}

function SourceList({ sources }: { sources: readonly string[] }) {
  const { t } = useTranslation("spectrum");

  return (
    <footer className="text-xs text-muted-foreground">
      {t("sources")}{" "}
      {sources.map((source, index) => {
        const link = sourceLink(source);
        return (
          <Fragment key={source}>
            {index > 0 ? ", " : null}
            {link === null ? (
              source
            ) : (
              <a
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-primary underline decoration-muted-foreground/40 underline-offset-2 transition-colors hover:decoration-current"
              >
                {link.label}
                <HugeiconsIcon icon={ArrowUpRight01Icon} className="size-3" aria-hidden="true" />
              </a>
            )}
          </Fragment>
        );
      })}
    </footer>
  );
}

export function SpectrumPage({ requestedCountryCode, onCountryChange }: SpectrumPageProps) {
  const { t } = useTranslation("spectrum");
  const [today] = useState(() => getLocalDay(new Date()));
  const [highlightedOperatorId, setHighlightedOperatorId] = useState<number | null>(null);
  const rememberedCountryCodes = useRememberedListCountries();
  const holdingsQuery = useQuery(spectrumHoldingsWithOperatorQueryOptions());
  const brandsQuery = useQuery(brandsQueryOptions());

  const holdings = holdingsQuery.data;
  const counts = holdings === undefined ? null : countHoldingsByCountry(holdings);
  const countryCode = counts === null ? null : pickCountry(counts, requestedCountryCode, rememberedCountryCodes);
  const countryHoldings = holdings?.filter((holding) => holding.operator.countryCode === countryCode) ?? [];
  const hasRegionalHoldings = countryHoldings.some((holding) => holding.regionId !== null);

  const planBandsQuery = useQuery({ ...bandsQueryOptions({ countryCode: countryCode ?? "" }), enabled: countryCode !== null });
  const regionsQuery = useQuery({ ...regionsQueryOptions({ countryCode: countryCode ?? "" }), enabled: countryCode !== null && hasRegionalHoldings });

  const queries = [holdingsQuery, brandsQuery, planBandsQuery];
  const failedQueries = queries.filter((query) => query.isError);

  function changeCountry(nextCountryCode: string) {
    setHighlightedOperatorId(null);
    onCountryChange(nextCountryCode);
  }

  function renderContent() {
    if (failedQueries.length > 0) {
      return (
        <ErrorState
          title={t("loadFailed")}
          onRetry={() => Promise.all(failedQueries.map((query) => query.refetch()))}
          isRetrying={failedQueries.some((query) => query.isFetching)}
        />
      );
    }
    if (counts !== null && countryCode === null) {
      return <ErrorState tone="neutral" icon={FullSignalIcon} title={t("empty.title")} description={t("empty.description")} />;
    }
    if (brandsQuery.data === undefined || planBandsQuery.data === undefined) return <SpectrumSkeleton />;

    const spectrum = buildCountrySpectrum({ holdings: countryHoldings, brands: brandsQuery.data, planBands: planBandsQuery.data, today });
    const effectiveHighlight = spectrum.totals.some((total) => total.operator.id === highlightedOperatorId) ? highlightedOperatorId : null;
    const regionNames = new Map((regionsQuery.data ?? []).map((region) => [region.id, region.name]));

    return (
      <>
        <PageSection id="spectrum-summary" title={t("summary.title")}>
          <SpectrumSummary spectrum={spectrum} highlightedOperatorId={effectiveHighlight} onHighlightChange={setHighlightedOperatorId} />
        </PageSection>
        {GROUPS.map((group) => {
          const sections = spectrum.sections.filter((section) => section.group === group);
          if (sections.length === 0) return null;
          return (
            <PageSection key={group} id={`spectrum-${group}`} title={t(`groups.${group}`)}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {sections.map((section) => (
                  <SpectrumBandCard key={section.key} section={section} highlightedOperatorId={effectiveHighlight} regionNames={regionNames} />
                ))}
              </div>
            </PageSection>
          );
        })}
        {spectrum.sources.length > 0 ? <SourceList sources={spectrum.sources} /> : null}
      </>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto p-4">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-bold">{t("nav:items.spectrum")}</h1>
            <p className="text-sm text-muted-foreground">{t("description")}</p>
          </div>
          {countryCode === null ? null : <CountryPicker countryCodes={[...(counts?.keys() ?? [])]} value={countryCode} onChange={changeCountry} />}
        </header>
        {renderContent()}
      </div>
    </main>
  );
}
