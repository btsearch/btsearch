import type { CountryStatistics } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  CardLoadError,
  CardLoading,
  CardNotice,
  CardStaleNotice,
  CountryName,
  DashboardCard,
  type DashboardLayout,
  getCardView,
  hasStaleRows,
} from "./dashboardCard";
import { Skeleton } from "@/components/ui/skeleton";
import { countryStatisticsQueryOptions } from "@/features/map/statsApi";
import { formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type DatabaseCardProps = {
  layout: DashboardLayout;
  className?: string;
};

type CountryBlockProps = {
  country: CountryStatistics;
  showsName: boolean;
};

type CountRowProps = {
  label: string;
  value: number;
};

type ImportDateRowProps = {
  label: string;
  importedAt: string | null;
};

type CountRowSkeletonProps = {
  widthClass: string;
};

const IMPORT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const SKELETON_LABEL_WIDTHS = ["w-22", "w-42", "w-28", "w-16", "w-21", "w-35", "w-33"];
const STALE_TEXT_CLASS = "text-amber-700 dark:text-amber-400";
const NO_COUNTRIES: CountryStatistics[] = [];

function isImportOutdated(importedAt: string | null): boolean {
  return importedAt === null || Date.now() - Date.parse(importedAt) > IMPORT_MAX_AGE_MS;
}

function CountRow({ label, value }: CountRowProps) {
  const { i18n } = useTranslation();

  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-[7px]">
      <dt className="text-[13px] leading-5 text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold tabular-nums">{value.toLocaleString(i18n.language)}</dd>
    </div>
  );
}

function ImportDateRow({ label, importedAt }: ImportDateRowProps) {
  const { t, i18n } = useTranslation("admin");
  const isOutdated = isImportOutdated(importedAt);

  return (
    <div className="flex items-baseline justify-between gap-3 py-[3px] text-xs">
      <dt className="min-w-0 text-muted-foreground">
        {label}
        {isOutdated ? <span className={cn("block", STALE_TEXT_CLASS)}>{t("dashboard.freshnessStale")}</span> : null}
      </dt>
      <dd className={cn("whitespace-nowrap tabular-nums", isOutdated ? STALE_TEXT_CLASS : null)}>{formatShortDate(importedAt, i18n.language)}</dd>
    </div>
  );
}

function CountryBlock({ country, showsName }: CountryBlockProps) {
  const { t } = useTranslation(["admin", "nav", "common"]);
  const { stations, official } = country;

  return (
    <div className={cn("shrink-0 border-t pb-2.5 first:border-t-0", showsName ? null : "pt-[5px]")}>
      {showsName ? (
        <h3 className="px-4 pt-3 pb-[3px] text-[13px] leading-[18px] font-semibold">
          <CountryName countryCode={country.countryCode} />
        </h3>
      ) : null}
      <dl>
        <CountRow label={t("dashboard.stats.activeStations")} value={stations.active} />
        <CountRow label={t("dashboard.stats.awaitingCellsStations")} value={stations.awaitingCells} />
        <CountRow label={t("dashboard.stats.inactiveStations")} value={stations.inactive} />
        <CountRow label={t("common:labels.cells")} value={country.cells} />
        <CountRow label={t("nav:items.locations")} value={country.locations} />
        {official === null ? null : (
          <>
            <CountRow label={t("dashboard.stats.registerPermits")} value={official.permits} />
            <CountRow label={t("dashboard.stats.registerMicrowaveLinks")} value={official.microwaveLinks} />
          </>
        )}
      </dl>
      {official === null ? null : (
        <dl className="mx-4 mt-1.5 border-t border-border/60 pt-2">
          <ImportDateRow label={t("dashboard.stats.permitsImported")} importedAt={official.permitsImportedAt} />
          <ImportDateRow label={t("dashboard.stats.microwaveLinksImported")} importedAt={official.microwaveLinksImportedAt} />
        </dl>
      )}
    </div>
  );
}

function CountRowSkeleton({ widthClass }: CountRowSkeletonProps) {
  return (
    <div className="flex h-[34px] items-center justify-between gap-3 px-4">
      <Skeleton className={cn("h-3", widthClass)} />
      <Skeleton className="h-3.5 w-13" />
    </div>
  );
}

export function DatabaseCard({ layout, className }: DatabaseCardProps) {
  const { t } = useTranslation(["nav", "common"]);
  const query = useQuery(countryStatisticsQueryOptions());
  const countries = query.data ?? NO_COUNTRIES;
  const view = getCardView(query, countries.length);
  const onlyCountry = countries.length === 1 ? countries[0] : undefined;

  return (
    <DashboardCard
      title={t("items.database")}
      isFilling={layout === "columns"}
      isBusy={view === "loading"}
      className={className}
      headEnd={
        view === "ready" && onlyCountry !== undefined ? (
          <span className="min-w-0 text-xs text-muted-foreground">
            <CountryName countryCode={onlyCountry.countryCode} />
          </span>
        ) : null
      }
      notice={view === "ready" && hasStaleRows(query) ? <CardStaleNotice onRetry={query.refetch} isRetrying={query.isFetching} /> : null}
    >
      {view === "loading" ? (
        <CardLoading className="pt-[5px] pb-2.5">
          <div aria-hidden="true">
            {SKELETON_LABEL_WIDTHS.map((widthClass) => (
              <CountRowSkeleton key={widthClass} widthClass={widthClass} />
            ))}
          </div>
        </CardLoading>
      ) : null}
      {view === "failed" ? <CardLoadError onRetry={query.refetch} isRetrying={query.isFetching} /> : null}
      {view === "empty" ? <CardNotice title={t("common:empty.data")} /> : null}
      {view === "ready"
        ? countries.map((country) => <CountryBlock key={country.countryCode} country={country} showsName={onlyCountry === undefined} />)
        : null}
    </DashboardCard>
  );
}
