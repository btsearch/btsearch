import type { MeasurementSummary } from "@openbts/shared/contract";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { measurementSummaryQueryOptions } from "../../measurementQueries";
import { SETTINGS_DESCRIPTION_CLASS, SettingsCard, SettingsCardHeader, SettingsCardNote, SettingsRowError } from "../settingsPrimitives";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { Skeleton } from "@/components/ui/skeleton";
import { formatShortDate } from "@/lib/format";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

const SUMMARY_STAT_COUNT = 5;

const STAT_GRID_CLASS = "grid gap-px border-t bg-border @4xl:grid-cols-5";

const STAT_CLASS =
  "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 bg-card px-4 py-3 [grid-template-areas:'label_value'_'hint_value'] @4xl:grid-cols-1 @4xl:items-start @4xl:px-5 @4xl:py-3.5 @4xl:[grid-template-areas:'label'_'value'_'hint']";

const COUNTRY_VALUE_CELL_CLASS = "w-24 py-2 pl-2.5 text-right sm:w-40 sm:pl-3";

function SummaryStat({ label, value, hint }: { label: string; value: number; hint: string | null }) {
  const { i18n } = useTranslation();

  return (
    <div className={STAT_CLASS}>
      <p className="text-xs leading-4 text-muted-foreground [grid-area:label]">{label}</p>
      <p className="text-lg leading-7 font-semibold tabular-nums [grid-area:value]">{value.toLocaleString(i18n.language)}</p>
      {hint !== null ? <p className="text-xs leading-4 text-muted-foreground [grid-area:hint]">{hint}</p> : null}
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div aria-hidden="true" className={STAT_GRID_CLASS}>
      {Array.from({ length: SUMMARY_STAT_COUNT }, (_, index) => (
        <div key={index} className="bg-card px-4 py-3 @4xl:px-5 @4xl:py-3.5">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="mt-1.5 h-5 w-18" />
          <Skeleton className="mt-2 h-3 w-32 max-w-full" />
        </div>
      ))}
    </div>
  );
}

function SummaryCountries({ countries }: { countries: MeasurementSummary["countries"] }) {
  const { t, i18n } = useTranslation("settings");

  return (
    <table className="w-full border-t text-[0.8125rem] leading-[1.125rem]">
      <thead>
        <tr className="text-xs leading-4 text-muted-foreground">
          <td className="w-px py-2 pr-3 pl-4 sm:pl-5" />
          <th scope="col" className="py-2 text-left font-normal">
            {t("measurements.summary.country")}
          </th>
          <th scope="col" className={cn(COUNTRY_VALUE_CELL_CLASS, "font-normal")}>
            {t("measurements.summary.samples")}
          </th>
          <th scope="col" className={cn(COUNTRY_VALUE_CELL_CLASS, "pr-4 font-normal sm:pr-5")}>
            {t("measurements.summary.squares")}
          </th>
        </tr>
      </thead>
      <tbody>
        {countries.map((country) => (
          <tr key={country.countryCode} className="border-t">
            <td className="py-2 pr-3 pl-4 sm:pl-5">
              <CountryCodeTile code={country.countryCode} size="sm" />
            </td>
            <th scope="row" className="py-2 text-left font-medium">
              {getCountryName(country.countryCode, i18n.language)}
            </th>
            <td className={cn(COUNTRY_VALUE_CELL_CLASS, "tabular-nums")}>{country.samples.toLocaleString(i18n.language)}</td>
            <td className={cn(COUNTRY_VALUE_CELL_CLASS, "pr-4 tabular-nums sm:pr-5")}>{country.newSquares.toLocaleString(i18n.language)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function SummaryBody({ summary }: { summary: MeasurementSummary }) {
  const { t, i18n } = useTranslation("settings");

  if (summary.uploads === 0) {
    return (
      <div className="border-t px-4 py-4 sm:px-5">
        <p className="text-sm leading-5 font-medium">{t("measurements.summary.empty")}</p>
        <p className={cn("mt-0.5", SETTINGS_DESCRIPTION_CLASS)}>{t("measurements.summary.emptyDescription")}</p>
      </div>
    );
  }

  const uploadsSince =
    summary.firstUploadAt === null ? null : t("measurements.summary.uploadsSince", { date: formatShortDate(summary.firstUploadAt, i18n.language) });

  return (
    <>
      <div className={STAT_GRID_CLASS}>
        <SummaryStat label={t("measurements.summary.uploads")} value={summary.uploads} hint={uploadsSince} />
        <SummaryStat label={t("measurements.summary.samples")} value={summary.samples} hint={t("measurements.summary.samplesHint")} />
        <SummaryStat label={t("measurements.summary.squares")} value={summary.newSquares} hint={t("measurements.summary.squaresHint")} />
        <SummaryStat label={t("measurements.summary.cells")} value={summary.discoveries.cells} hint={t("measurements.summary.discoveriesHint")} />
        <SummaryStat label={t("measurements.summary.sites")} value={summary.discoveries.sites} hint={t("measurements.summary.discoveriesHint")} />
      </div>
      {summary.countries.length > 0 ? <SummaryCountries countries={summary.countries} /> : null}
      <SettingsCardNote>{t("measurements.summary.newNote")}</SettingsCardNote>
    </>
  );
}

export function MeasurementSummaryCard({ userId }: { userId: string }) {
  const { t } = useTranslation("settings");
  const { data: summary, isPending, isFetching, refetch } = useQuery(measurementSummaryQueryOptions(userId));

  return (
    <SettingsCard>
      <SettingsCardHeader title={t("measurements.summary.title")} description={t("measurements.summary.description")} />
      {isPending ? (
        <SummarySkeleton />
      ) : summary === undefined ? (
        <div className="border-t">
          <SettingsRowError title={t("measurements.summary.loadFailed")} onRetry={() => void refetch()} isRetrying={isFetching} />
        </div>
      ) : (
        <SummaryBody summary={summary} />
      )}
    </SettingsCard>
  );
}
