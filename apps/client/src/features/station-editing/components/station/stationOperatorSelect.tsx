import type { Brand, Operator } from "@openbts/shared/contract";
import { useTranslation } from "react-i18next";

import type { FieldControlProps } from "./stationFields";
import { BrandMark } from "@/components/cellular/brandMark";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getOperatorBrand } from "@/features/station-details/station/utils/brands";

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
  showsCountry: boolean;
};

function compareMainOperators(left: Operator, right: Operator): number {
  return (left.sortPriority ?? 0) - (right.sortPriority ?? 0) || left.name.localeCompare(right.name);
}

function compareOperatorNames(left: Operator, right: Operator): number {
  return left.name.localeCompare(right.name);
}

function OperatorItems({ operators, brands, showsCountry }: OperatorItemsProps) {
  return (
    <>
      {operators.map((operator) => (
        <SelectItem key={operator.id} value={String(operator.id)} className="cursor-pointer">
          <BrandMark brand={getOperatorBrand(operator, brands)} size={16} />
          {operator.name}
          {showsCountry ? <CountryCodeTile code={operator.countryCode} size="xs" /> : null}
        </SelectItem>
      ))}
    </>
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
  const { t } = useTranslation("common");
  const options = selected === null || operators.some((operator) => operator.id === selected.id) ? operators : [...operators, selected];
  const mainOperators = options.filter((operator) => operator.sortPriority !== null).sort(compareMainOperators);
  const otherOperators = options.filter((operator) => operator.sortPriority === null).sort(compareOperatorNames);
  const showsCountry = new Set(options.map((operator) => operator.countryCode)).size > 1;

  function changeOperator(value: string | null) {
    const operator = options.find((option) => String(option.id) === value);
    if (operator !== undefined) onChange(operator);
  }

  return (
    <Select value={selected === null ? null : String(selected.id)} onValueChange={changeOperator} disabled={isDisabled}>
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
        <OperatorItems operators={mainOperators} brands={brands} showsCountry={showsCountry} />
        {mainOperators.length > 0 && otherOperators.length > 0 ? <SelectSeparator /> : null}
        <OperatorItems operators={otherOperators} brands={brands} showsCountry={showsCountry} />
      </SelectContent>
    </Select>
  );
}
