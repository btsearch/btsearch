import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import type { Operator } from "../../types";
import { formatPlmn } from "../../utils/plmn";
import { BrandTile } from "../shared/brandTile";
import { getKnownCount } from "../shared/loadable";
import { ReferenceMeta, ReferenceMetaItem, TINTED_BUTTON_CLASS } from "../shared/referenceCards";
import { HeroStat, ReferenceHero } from "../shared/referenceHero";
import { CountValue, EMPTY_VALUE, MONO_TEXT_CLASS } from "../shared/values";
import { findBrand } from "./operatorBrands";
import { listNetworkMembers } from "./operatorLinks";
import { useOperatorActiveStations } from "./useOperatorActiveStations";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { brandsQueryOptions, operatorsQueryOptions } from "@/features/shared/lookups";
import { toOperatorStationsListSearch } from "@/features/stations/list/data/stationsListSearch";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

const HERO_NAME_ID = "operator-name";
const STATIONS_LINK_CLASS = cn(buttonVariants({ variant: "ghost" }), TINTED_BUTTON_CLASS);

export function OperatorHero({ operator }: { operator: Operator }) {
  const { t, i18n } = useTranslation("admin");
  const { data: brands } = useQuery(brandsQueryOptions());
  const { data: operators } = useQuery(operatorsQueryOptions());
  const stations = useOperatorActiveStations(operator.id);

  const language = i18n.language;
  const brand = findBrand(brands, operator.brandId);
  const memberCount = listNetworkMembers(operator.id, operators).length;
  const plmnCount = operator.plmns.length;
  const networkCount = operator.links.length;
  const listPosition = operator.sortPriority;
  const listPositionValue = listPosition === null ? EMPTY_VALUE : t("reference.operator.hero.stats.listPositionValue", { position: listPosition });
  const linkedCount = memberCount > 0 ? memberCount : networkCount;
  const linkedLabel =
    memberCount > 0
      ? t("reference.operator.hero.stats.members", { count: memberCount })
      : t("reference.operator.hero.stats.sharedNetworks", { count: networkCount });

  return (
    <ReferenceHero
      lead={<BrandTile brand={brand} size={72} />}
      title={operator.name}
      titleId={HERO_NAME_ID}
      badges={operator.shortCode === null ? null : <Badge variant="secondary">{operator.shortCode}</Badge>}
      meta={
        <ReferenceMeta>
          <ReferenceMetaItem>{operator.legalName}</ReferenceMetaItem>
          <ReferenceMetaItem>{getCountryName(operator.countryCode, language)}</ReferenceMetaItem>
          {operator.primaryPlmn === null ? null : (
            <ReferenceMetaItem>
              <span className={MONO_TEXT_CLASS}>{formatPlmn(operator.primaryPlmn)}</span>
            </ReferenceMetaItem>
          )}
        </ReferenceMeta>
      }
      action={
        <Link to="/admin/stations" search={toOperatorStationsListSearch(operator)} className={STATIONS_LINK_CLASS}>
          <HugeiconsIcon icon={ArrowUpRight01Icon} data-icon="inline-start" aria-hidden="true" />
          {t("reference.operator.hero.stations")}
        </Link>
      }
      stats={
        <>
          <HeroStat
            value={<CountValue count={stations} skeletonClassName="h-4 w-12" />}
            label={t("reference.operator.hero.stats.activeStations", { count: getKnownCount(stations) })}
          />
          <HeroStat value={listPositionValue} label={t("reference.operator.hero.stats.listPosition")} />
          <HeroStat value={plmnCount.toLocaleString(language)} label={t("reference.operator.hero.stats.plmns", { count: plmnCount })} />
          <HeroStat value={linkedCount.toLocaleString(language)} label={linkedLabel} />
        </>
      }
      washColor={brand?.color}
    />
  );
}
