import { ArrowDown01Icon, Globe02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";

import type { CountryFilter } from "../useCountryFilter";
import { buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { InlineError } from "@/components/ui/error-state";
import { MobileFilterChip, MobileFilterPanelTitle } from "@/components/ui/mobile-filter-chip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FacetToggles } from "@/features/admin/reference/components/shared/facetToggles";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type CountryFilterControlProps = {
  filter: CountryFilter;
  onChange: (countryCodes: string[]) => void;
};
type CountryFilterStatusProps = { filter: CountryFilter };
type CountryFilterLabelProps = { countryCodes: readonly string[] };

const TRIGGER_CLASS = cn(buttonVariants({ variant: "outline" }), "max-w-65 min-w-35 cursor-pointer justify-start gap-2 font-normal");

function toggleCountry(countryCodes: readonly string[], countryCode: string): string[] {
  return countryCodes.includes(countryCode) ? countryCodes.filter((code) => code !== countryCode) : [...countryCodes, countryCode];
}

function CountryFilterStatus({ filter }: CountryFilterStatusProps) {
  const { t } = useTranslation(["admin", "common"]);

  if (filter.hasFailed) {
    return (
      <InlineError size="sm" title={t("users.detail.grants.dialog.countriesLoadFailed")} onRetry={filter.retry} isRetrying={filter.isRetrying} />
    );
  }

  return <p className="px-2 py-1 text-xs text-muted-foreground">{filter.isLoading ? t("common:actions.loading") : t("common:empty.data")}</p>;
}

function CountryFilterLabel({ countryCodes }: CountryFilterLabelProps) {
  const { t, i18n } = useTranslation("admin");
  const onlyCountryCode = countryCodes.length === 1 ? countryCodes[0] : undefined;

  if (onlyCountryCode !== undefined) {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <CountryCodeTile code={onlyCountryCode} size="xs" />
        <span className="truncate">{getCountryName(onlyCountryCode, i18n.language)}</span>
      </span>
    );
  }

  return (
    <span className="truncate">
      {countryCodes.length === 0 ? t("auditLogs.filters.allCountries") : t("auditLogs.counts.countries", { count: countryCodes.length })}
    </span>
  );
}

export function CountryFilterButton({ filter, onChange }: CountryFilterControlProps) {
  const { t } = useTranslation(["admin", "common"]);
  const optionIdPrefix = useId();
  const [open, setOpen] = useState(false);
  const { options, selected } = filter;
  const label = t("users.detail.grants.dialog.country");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(TRIGGER_CLASS, selected.length > 0 ? "text-foreground" : "text-muted-foreground")}>
        <span className="sr-only">{label}: </span>
        <CountryFilterLabel countryCodes={selected} />
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          aria-hidden="true"
          className={cn("ml-auto size-3.5 shrink-0 transition-transform motion-reduce:transition-none", open && "rotate-180")}
        />
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={label} className="max-h-96 w-72 overflow-y-auto p-0">
        {selected.length > 0 ? (
          <div className="flex items-center justify-between border-b px-3 py-2">
            <span className="text-xs text-muted-foreground">{t("auditLogs.counts.countries", { count: selected.length })}</span>
            <button
              type="button"
              onClick={() => onChange([])}
              className="cursor-pointer text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              {t("common:actions.clear")}
            </button>
          </div>
        ) : null}
        {options.length === 0 ? (
          <div className="p-1.5">
            <CountryFilterStatus filter={filter} />
          </div>
        ) : (
          <div className="py-1">
            {options.map((country) => {
              const optionId = `${optionIdPrefix}-${country.code}`;
              const isChecked = selected.includes(country.code);
              return (
                <label
                  key={country.code}
                  htmlFor={optionId}
                  className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-muted/50"
                >
                  <Checkbox id={optionId} checked={isChecked} onCheckedChange={() => onChange(toggleCountry(selected, country.code))} />
                  <CountryCodeTile code={country.code} size="xs" />
                  <span className="min-w-0 truncate text-xs">{country.name}</span>
                  {isChecked ? <HugeiconsIcon icon={Tick02Icon} className="ml-auto size-3 text-muted-foreground" aria-hidden="true" /> : null}
                </label>
              );
            })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function CountryFilterChip({ filter, onChange }: CountryFilterControlProps) {
  const { t } = useTranslation("admin");
  const label = t("users.detail.grants.dialog.country");
  const options = filter.options.map((country) => ({
    value: country.code,
    label: country.name,
    lead: <CountryCodeTile code={country.code} size="xs" />,
  }));

  return (
    <MobileFilterChip active={filter.selected.length > 0} count={filter.selected.length} icon={Globe02Icon} label={label}>
      <MobileFilterPanelTitle>{label}</MobileFilterPanelTitle>
      {options.length === 0 ? (
        <CountryFilterStatus filter={filter} />
      ) : (
        <FacetToggles layout="list" showLabel={false} label={label} options={options} selected={filter.selected} onChange={onChange} />
      )}
    </MobileFilterChip>
  );
}
