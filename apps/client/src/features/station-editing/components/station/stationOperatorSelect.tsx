import type { SelectRootChangeEventDetails } from "@base-ui/react/select";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Brand, Operator } from "@openbts/shared/contract";
import { Fragment, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { FieldControlProps } from "./stationFields";
import { BrandMark } from "@/components/cellular/brandMark";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MOST_ALWAYS_OPEN_OPERATOR_ROWS } from "@/features/map/components/search-overlay/mapFilterPanelRules";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";
import { getCountryName } from "@/lib/geo/countryName";
import { cn, toggleValue } from "@/lib/utils";

type StationOperatorSelectProps = {
  operators: readonly Operator[];
  brands: readonly Brand[];
  selected: Operator | null;
  onChange: (operator: Operator) => void;
  labelId: string;
  controlProps?: FieldControlProps;
  isDisabled?: boolean;
  className?: string;
};

type OperatorItemsProps = {
  operators: readonly Operator[];
  brands: readonly Brand[];
};

type CountryOperators = {
  countryCode: string;
  countryName: string;
  mainOperators: Operator[];
  otherOperators: Operator[];
};

type CountryOperatorItemsProps = {
  country: CountryOperators;
  brands: readonly Brand[];
  selectedId: number | null;
  isFoldOpen: boolean;
};

type CountryRowItemProps = {
  country: CountryOperators;
  isOpen: boolean;
};

type OpenStateTextProps = {
  isOpen: boolean;
};

const FOLD_VALUE_PREFIX = "fold:";
const COUNTRY_VALUE_PREFIX = "country:";
const CHEVRON_CLASS = "absolute right-2 size-3.5 text-muted-foreground transition-transform motion-reduce:transition-none";

function compareMainOperators(left: Operator, right: Operator): number {
  return (left.sortPriority ?? 0) - (right.sortPriority ?? 0) || left.name.localeCompare(right.name);
}

function compareOperatorNames(left: Operator, right: Operator): number {
  return left.name.localeCompare(right.name);
}

function groupByCountry(operators: readonly Operator[], language: string): CountryOperators[] {
  const countries = new Map<string, CountryOperators>();
  for (const operator of operators) {
    const { countryCode } = operator;
    const country = countries.get(countryCode) ?? {
      countryCode,
      countryName: getCountryName(countryCode, language),
      mainOperators: [],
      otherOperators: [],
    };
    if (operator.sortPriority === null) country.otherOperators.push(operator);
    else country.mainOperators.push(operator);
    countries.set(countryCode, country);
  }
  for (const country of countries.values()) {
    country.mainOperators.sort(compareMainOperators);
    country.otherOperators.sort(compareOperatorNames);
  }
  return [...countries.values()].sort((left, right) => left.countryName.localeCompare(right.countryName, language));
}

function OperatorItems({ operators, brands }: OperatorItemsProps) {
  return (
    <>
      {operators.map((operator) => (
        <SelectItem key={operator.id} value={String(operator.id)} className="cursor-pointer">
          <BrandMark brand={getOperatorBrand(operator, brands)} size={16} />
          {operator.name}
        </SelectItem>
      ))}
    </>
  );
}

function OpenStateText({ isOpen }: OpenStateTextProps) {
  const { t } = useTranslation("common");
  return <span className="sr-only">{isOpen ? t("labels.expanded") : t("labels.collapsed")}</span>;
}

function CountryOperatorItems({ country, brands, selectedId, isFoldOpen }: CountryOperatorItemsProps) {
  const { t } = useTranslation("common");
  const pinnedOperators = [...country.mainOperators, ...country.otherOperators.filter((operator) => operator.id === selectedId)];
  const foldedOperators = country.otherOperators.filter((operator) => operator.id !== selectedId);

  return (
    <>
      <OperatorItems operators={pinnedOperators} brands={brands} />
      {foldedOperators.length > 0 ? (
        <SelectItem value={`${FOLD_VALUE_PREFIX}${country.countryCode}`} className="cursor-pointer text-muted-foreground">
          <span className="truncate">{t("labels.otherOperators", { count: foldedOperators.length })}</span>
          <OpenStateText isOpen={isFoldOpen} />
          <HugeiconsIcon icon={ArrowDown01Icon} className={cn(CHEVRON_CLASS, isFoldOpen ? "rotate-180" : null)} aria-hidden="true" />
        </SelectItem>
      ) : null}
      {isFoldOpen ? <OperatorItems operators={foldedOperators} brands={brands} /> : null}
    </>
  );
}

function CountryRowItem({ country, isOpen }: CountryRowItemProps) {
  return (
    <SelectItem value={`${COUNTRY_VALUE_PREFIX}${country.countryCode}`} className={cn("cursor-pointer", isOpen ? "bg-muted" : null)}>
      <CountryCodeTile code={country.countryCode} size="xs" />
      <span className="truncate">{country.countryName}</span>
      <OpenStateText isOpen={isOpen} />
      <HugeiconsIcon icon={ArrowDown01Icon} className={cn(CHEVRON_CLASS, isOpen ? "rotate-180" : null)} aria-hidden="true" />
    </SelectItem>
  );
}

export function StationOperatorSelect({
  operators,
  brands,
  selected,
  onChange,
  labelId,
  controlProps,
  isDisabled = false,
  className,
}: StationOperatorSelectProps) {
  const { t, i18n } = useTranslation("common");
  const [foldOpenCountryCodes, setFoldOpenCountryCodes] = useState<string[]>([]);
  const [toggledCountryCodes, setToggledCountryCodes] = useState<string[]>([]);
  const isTogglePressRef = useRef(false);
  const options = selected === null || operators.some((operator) => operator.id === selected.id) ? operators : [...operators, selected];
  const countries = groupByCountry(options, i18n.language);
  const [onlyCountry] = countries;
  const hasCountryRows = countries.length > MOST_ALWAYS_OPEN_OPERATOR_ROWS;
  const selectedId = selected?.id ?? null;

  function keepOpen(eventDetails: SelectRootChangeEventDetails) {
    eventDetails.cancel();
    isTogglePressRef.current = true;
  }

  function changeOperator(value: string | null, eventDetails: SelectRootChangeEventDetails) {
    if (value?.startsWith(FOLD_VALUE_PREFIX)) {
      keepOpen(eventDetails);
      setFoldOpenCountryCodes((current) => toggleValue(current, value.slice(FOLD_VALUE_PREFIX.length)));
      return;
    }
    if (value?.startsWith(COUNTRY_VALUE_PREFIX)) {
      keepOpen(eventDetails);
      setToggledCountryCodes((current) => toggleValue(current, value.slice(COUNTRY_VALUE_PREFIX.length)));
      return;
    }
    const operator = options.find((option) => String(option.id) === value);
    if (operator !== undefined) onChange(operator);
  }

  function changeOpen(isOpen: boolean, eventDetails: SelectRootChangeEventDetails) {
    if (isOpen || !isTogglePressRef.current) return;
    isTogglePressRef.current = false;
    eventDetails.cancel();
  }

  return (
    <Select value={selected === null ? null : String(selected.id)} onValueChange={changeOperator} onOpenChange={changeOpen} disabled={isDisabled}>
      <SelectTrigger {...controlProps} aria-labelledby={labelId} className={className}>
        <SelectValue>
          {selected === null ? (
            <span className="text-muted-foreground">{t("placeholder.selectOperator")}</span>
          ) : (
            <>
              <BrandMark brand={getOperatorBrand(selected, brands)} size={16} />
              <span className="truncate">{selected.name}</span>
            </>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="min-w-56">
        {countries.length === 1 ? (
          <>
            <OperatorItems operators={onlyCountry.mainOperators} brands={brands} />
            {onlyCountry.mainOperators.length > 0 && onlyCountry.otherOperators.length > 0 ? <SelectSeparator /> : null}
            <OperatorItems operators={onlyCountry.otherOperators} brands={brands} />
          </>
        ) : (
          countries.map((country, index) => {
            const operatorItems = (
              <CountryOperatorItems
                country={country}
                brands={brands}
                selectedId={selectedId}
                isFoldOpen={foldOpenCountryCodes.includes(country.countryCode)}
              />
            );

            if (hasCountryRows) {
              const isOpen = (country.countryCode === selected?.countryCode) !== toggledCountryCodes.includes(country.countryCode);
              return (
                <Fragment key={country.countryCode}>
                  <CountryRowItem country={country} isOpen={isOpen} />
                  {isOpen ? operatorItems : null}
                </Fragment>
              );
            }

            return (
              <Fragment key={country.countryCode}>
                {index > 0 ? <SelectSeparator /> : null}
                <SelectGroup>
                  <SelectLabel className="flex items-center gap-1.5">
                    <CountryCodeTile code={country.countryCode} size="xs" />
                    <span className="truncate">{country.countryName}</span>
                  </SelectLabel>
                  {operatorItems}
                </SelectGroup>
              </Fragment>
            );
          })
        )}
      </SelectContent>
    </Select>
  );
}
