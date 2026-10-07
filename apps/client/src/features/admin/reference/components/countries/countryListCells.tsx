import { Alert02Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";

import { type Loadable, isZeroCount } from "../shared/loadable";
import { StatusBadge } from "../shared/referenceCards";
import { CountValue, EMPTY_VALUE, MONO_TEXT_CLASS } from "../shared/values";
import type { CountryListRow } from "./useCountryListRows";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type CountryCountProps = {
  count: Loadable<number>;
};

const WARNING_TEXT_CLASS = "text-amber-700 dark:text-amber-400";

export function CountryIdentity({ row }: { row: CountryListRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <CountryCodeTile code={row.country.code} size="md" />
      <div className="truncate text-sm font-medium">{row.name}</div>
    </div>
  );
}

export function CountryListNumber({ count }: CountryCountProps) {
  return (
    <div className={cn(MONO_TEXT_CLASS, isZeroCount(count) && "text-muted-foreground")}>
      <CountValue count={count} />
    </div>
  );
}

export function CountryRegionCount({ count }: CountryCountProps) {
  const { t } = useTranslation("admin");

  if (!isZeroCount(count)) return <CountryListNumber count={count} />;

  return (
    <StatusBadge tone="warning" icon={Alert02Icon} className={WARNING_TEXT_CLASS}>
      {t("reference.countries.none")}
    </StatusBadge>
  );
}

export function CountryPlanSize({ count }: CountryCountProps) {
  const { t } = useTranslation("admin");

  if (!isZeroCount(count)) return <CountryListNumber count={count} />;

  return (
    <StatusBadge tone="warning" icon={Alert02Icon} className={WARNING_TEXT_CLASS}>
      {t("reference.countries.emptyPlan")}
    </StatusBadge>
  );
}

export function CountryTeamSummary({ team }: { team: CountryListRow["team"] }) {
  const { t } = useTranslation("admin");

  if (team.state === "loading") return <Skeleton aria-hidden="true" className="h-4 w-32" />;
  if (team.state === "failed") return <div className="text-muted-foreground">{EMPTY_VALUE}</div>;

  const { maintainers, editors } = team.value;
  const members: string[] = [];
  if (maintainers > 0) members.push(t("reference.countries.team.maintainers", { count: maintainers }));
  if (editors > 0) members.push(t("reference.countries.team.editors", { count: editors }));
  if (members.length === 0) return <div className="text-muted-foreground">{EMPTY_VALUE}</div>;

  return <div className="whitespace-nowrap">{members.join(", ")}</div>;
}
