import { createFileRoute } from "@tanstack/react-router";

import { StatisticsPage } from "@/features/statistics/components/statisticsPage";
import { prefetchStatistics } from "@/features/statistics/queries";
import { isCountryCode } from "@/lib/apiValues";
import { buildStaticPageHead } from "@/lib/seo";

type StatisticsSearch = { country?: string };

function StatisticsRoute() {
  const { country } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <StatisticsPage
      requestedCountryCode={country ?? null}
      onCountryChange={(countryCode) => void navigate({ search: { country: countryCode }, replace: true })}
    />
  );
}

export const Route = createFileRoute("/_layout/statistics")({
  codeSplitGroupings: [["loader"], ["component"]],
  component: StatisticsRoute,
  validateSearch: (search: Record<string, unknown>): StatisticsSearch => (isCountryCode(search.country) ? { country: search.country } : {}),
  loaderDeps: ({ search }) => ({ country: search.country }),
  loader: ({ deps }) => prefetchStatistics(deps.country),
  head: () => buildStaticPageHead("/statistics"),
  staticData: {
    titleKey: "items.statistics",
    i18nNamespace: "nav",
    breadcrumbs: [{ titleKey: "sections.stations", i18nNamespace: "nav", path: "/" }],
  },
});
