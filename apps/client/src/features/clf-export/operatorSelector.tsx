import type { Country, Operator } from "@openbts/shared/contract";
import { Fragment, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from "@/components/ui/combobox";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { Label } from "@/components/ui/label";
import { DialogOperatorName } from "@/features/station-details/components/dialogOperatorName";
import { toV1OperatorMnc } from "@/features/station-details/station/utils/stations";
import { foldText } from "@/lib/foldText";
import { getCountryName } from "@/lib/geo/countryName";
import { cn } from "@/lib/utils";

type OperatorOption = {
  key: string;
  countryCode: string;
  operator: Operator | null;
};

type OperatorSelectorProps = {
  countries: readonly Country[];
  operators: readonly Operator[];
  countryCode: string;
  operatorIds: readonly number[] | null;
  disabled: boolean;
  onChange: (countryCode: string, operatorIds: number[]) => void;
};

export function ClfOperatorSelector({ countries, operators, countryCode, operatorIds, disabled, onChange }: OperatorSelectorProps) {
  const { t, i18n } = useTranslation("clfExport");
  const anchorRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const allOperatorsLabel = t("common:labels.allOperators");
  const operatorsByCountry = new Map<string, Operator[]>();
  for (const operator of operators) {
    const group = operatorsByCountry.get(operator.countryCode) ?? [];
    group.push(operator);
    operatorsByCountry.set(operator.countryCode, group);
  }

  const groups = countries
    .map((country) => ({
      countryCode: country.code,
      name: getCountryName(country.code, i18n.language),
      options: [
        { key: `country:${country.code}`, countryCode: country.code, operator: null },
        ...(operatorsByCountry.get(country.code) ?? []).map((operator) => ({
          key: `operator:${operator.id}`,
          countryCode: country.code,
          operator,
        })),
      ] satisfies OperatorOption[],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  const optionsByKey = new Map(groups.flatMap((group) => group.options.map((option) => [option.key, option] as const)));
  let selectedKeys: string[] = [];
  if (operatorIds !== null) selectedKeys = operatorIds.length === 0 ? [`country:${countryCode}`] : operatorIds.map((id) => `operator:${id}`);
  const selectedOptions = selectedKeys.flatMap((key) => {
    const option = optionsByKey.get(key);
    return option === undefined ? [] : [option];
  });
  const foldedQuery = foldText(query.trim());
  const matchingGroups = groups.flatMap((group) => {
    const matchesCountry = foldText(`${group.name} ${group.countryCode}`).includes(foldedQuery);
    const options = group.options.filter((option) => {
      if (matchesCountry) return true;
      if (option.operator === null) return foldText(allOperatorsLabel).includes(foldedQuery);
      const operator = option.operator;
      return foldText(
        `${operator.name} ${operator.legalName} ${operator.shortCode ?? ""} ${operator.plmns.map((plmn) => plmn.plmn).join(" ")}`,
      ).includes(foldedQuery);
    });
    return options.length === 0 ? [] : [{ ...group, options }];
  });

  function changeSelection(keys: string[]) {
    const addedKey = keys.find((key) => !selectedKeys.includes(key));
    const addedOption = addedKey === undefined ? undefined : optionsByKey.get(addedKey);
    if (addedOption?.operator === null) {
      onChange(addedOption.countryCode, []);
      return;
    }
    const nextCountryCode = addedOption?.countryCode ?? countryCode;
    const nextOperatorIds = keys.flatMap((key) => {
      const option = optionsByKey.get(key);
      if (option === undefined || option.countryCode !== nextCountryCode || option.operator === null) return [];
      return [option.operator.id];
    });
    onChange(nextCountryCode, nextOperatorIds);
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="clf-operators" className="text-sm font-semibold">
          {t("common:labels.operator")}
        </Label>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CountryCodeTile code={countryCode} size="xs" />
          {getCountryName(countryCode, i18n.language)}
        </span>
      </div>
      <Combobox
        multiple
        disabled={disabled}
        items={matchingGroups.flatMap((group) => group.options.map((option) => option.key))}
        filter={null}
        value={selectedKeys}
        onValueChange={changeSelection}
        inputValue={query}
        onInputValueChange={setQuery}
      >
        <ComboboxChips ref={anchorRef} className={cn("min-h-10 max-h-24 overflow-y-auto text-base md:text-sm", disabled && "opacity-60")}>
          {selectedOptions.map((option) => (
            <ComboboxChip
              key={option.key}
              showRemove={option.operator !== null}
              className="h-8 min-w-0 max-w-full rounded-md px-2 text-base font-normal md:text-sm"
            >
              {option.operator === null ? (
                allOperatorsLabel
              ) : (
                <DialogOperatorName
                  name={option.operator.name}
                  mnc={toV1OperatorMnc(option.operator)}
                  compact
                  labelClassName="text-base font-normal md:text-sm"
                />
              )}
            </ComboboxChip>
          ))}
          <ComboboxChipsInput
            id="clf-operators"
            aria-describedby="clf-operators-hint"
            disabled={disabled}
            className="h-8 text-base md:text-sm"
            placeholder={selectedOptions.length === 0 ? t("common:placeholder.selectOperators") : ""}
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchorRef}>
          <ComboboxList>
            <ComboboxEmpty>{t("common:placeholder.noOperatorsFound")}</ComboboxEmpty>
            {matchingGroups.map((group, index) => (
              <Fragment key={group.countryCode}>
                {index > 0 ? <ComboboxSeparator /> : null}
                <ComboboxGroup>
                  <ComboboxLabel className="flex items-center gap-1.5">
                    <CountryCodeTile code={group.countryCode} size="xs" />
                    {group.name}
                  </ComboboxLabel>
                  {group.options.map((option) => (
                    <ComboboxItem key={option.key} value={option.key}>
                      {option.operator === null ? (
                        allOperatorsLabel
                      ) : (
                        <>
                          <DialogOperatorName
                            name={option.operator.name}
                            mnc={toV1OperatorMnc(option.operator)}
                            compact
                            labelClassName="text-sm font-normal"
                          />
                          <span className="ml-auto text-xs text-muted-foreground">{option.operator.primaryPlmn}</span>
                        </>
                      )}
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              </Fragment>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <p id="clf-operators-hint" className="text-xs text-muted-foreground">
        {t("form.singleCountryHint")}
      </p>
    </>
  );
}
