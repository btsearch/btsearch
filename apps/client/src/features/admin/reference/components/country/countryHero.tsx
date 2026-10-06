import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { bandPlanQueryOptions } from "../../api/bandPlan";
import { countryStatisticsQueryOptions } from "../../api/statistics";
import type { Country } from "../../types";
import { CountryContributionsBadge, CountryVisibilityBadge } from "../countries/countryStatusBadges";
import { type Loadable, getKnownCount, toLoadable } from "../shared/loadable";
import { HeroStat, ReferenceHero } from "../shared/referenceHero";
import { CountValue } from "../shared/values";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { operatorsQueryOptions, regionsQueryOptions } from "@/features/shared/lookups";
import { getCountryName } from "@/lib/geo/countryName";

type CountStatProps = {
  count: Loadable<number>;
  label: string;
};

const HERO_NAME_ID = "country-name";
const NO_STATISTICS = { stations: { active: 0 }, cells: 0, locations: 0 };

function CountStat({ count, label }: CountStatProps) {
  return <HeroStat value={<CountValue count={count} skeletonClassName="h-4 w-10" />} label={label} />;
}

export function CountryHero({ country }: { country: Country }) {
  const { t, i18n } = useTranslation("admin");
  const statisticsQuery = useQuery(countryStatisticsQueryOptions());
  const regionsQuery = useQuery(regionsQueryOptions());
  const operatorsQuery = useQuery(operatorsQueryOptions());
  const bandPlanQuery = useQuery(bandPlanQueryOptions(country.code));

  const listedStatistics = statisticsQuery.data?.find((countryStatistics) => countryStatistics.countryCode === country.code);
  const statistics = statisticsQuery.data === undefined ? undefined : (listedStatistics ?? NO_STATISTICS);
  const activeStations = toLoadable(statistics?.stations.active, statisticsQuery.isError);
  const cells = toLoadable(statistics?.cells, statisticsQuery.isError);
  const locations = toLoadable(statistics?.locations, statisticsQuery.isError);
  const regionCount = toLoadable(regionsQuery.data?.filter((region) => region.countryCode === country.code).length, regionsQuery.isError);
  const operatorCount = toLoadable(operatorsQuery.data?.filter((operator) => operator.countryCode === country.code).length, operatorsQuery.isError);
  const planSize = toLoadable(bandPlanQuery.data?.length, bandPlanQuery.isError);

  return (
    <ReferenceHero
      lead={<CountryCodeTile code={country.code} size="lg" />}
      title={getCountryName(country.code, i18n.language)}
      titleId={HERO_NAME_ID}
      badges={
        <>
          <CountryVisibilityBadge isVisible={country.isVisible} />
          <CountryContributionsBadge contributions={country.contributions} isLong />
        </>
      }
      meta={t("reference.country.hero.countryCode", { code: country.code })}
      stats={
        <>
          <CountStat count={activeStations} label={t("reference.country.hero.stats.activeStations", { count: getKnownCount(activeStations) })} />
          <CountStat count={cells} label={t("reference.country.hero.stats.cells", { count: getKnownCount(cells) })} />
          <CountStat count={locations} label={t("reference.country.hero.stats.locations", { count: getKnownCount(locations) })} />
          <CountStat count={regionCount} label={t("reference.country.hero.stats.regions", { count: getKnownCount(regionCount) })} />
          <CountStat count={operatorCount} label={t("reference.country.hero.stats.operators", { count: getKnownCount(operatorCount) })} />
          <CountStat count={planSize} label={t("reference.country.hero.stats.bandPlan", { count: getKnownCount(planSize) })} />
        </>
      }
    />
  );
}
