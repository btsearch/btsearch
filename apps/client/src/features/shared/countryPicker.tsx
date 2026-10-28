import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { FacetPill } from "@/features/shared/filterPanel";
import { getCountryName } from "@/lib/geo/countryName";

type PickerCountry = { code: string; name: string };

type CountryPickerProps = {
  countryCodes: readonly string[];
  value: string;
  onChange: (countryCode: string) => void;
};

const MAX_COUNTRY_PILLS = 5;

export function pickCountry(counts: ReadonlyMap<string, number>, requested: string | null, remembered: readonly string[]): string | null {
  if (requested !== null && counts.has(requested)) return requested;
  const rememberedCountry = remembered.find((countryCode) => counts.has(countryCode));
  if (rememberedCountry !== undefined) return rememberedCountry;
  return [...counts].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function getCountrySearchLabel(country: PickerCountry): string {
  return `${country.name} ${country.code}`;
}

function CountryLabel({ country }: { country: PickerCountry }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CountryCodeTile code={country.code} size="xs" />
      <span className="truncate">{country.name}</span>
    </span>
  );
}

export function CountryPicker({ countryCodes, value, onChange }: CountryPickerProps) {
  const { t, i18n } = useTranslation("common");
  const countries: PickerCountry[] = countryCodes
    .map((code) => ({ code, name: getCountryName(code, i18n.language) }))
    .sort((left, right) => left.name.localeCompare(right.name, i18n.language));
  const selected = countries.find((country) => country.code === value) ?? null;

  if (countries.length === 1 && selected !== null) {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <CountryCodeTile code={selected.code} size="xs" />
        {selected.name}
      </span>
    );
  }

  if (countries.length <= MAX_COUNTRY_PILLS) {
    return (
      <div role="group" aria-label={t("labels.country")} className="flex flex-wrap gap-1.5">
        {countries.map((country) => {
          const isActive = country.code === value;
          return (
            <FacetPill key={country.code} active={isActive} onClick={() => onChange(country.code)} className="cursor-pointer pl-1.25">
              <CountryCodeTile code={country.code} size="xs" tone={isActive ? "inverse" : "default"} />
              {country.name}
            </FacetPill>
          );
        })}
      </div>
    );
  }

  return (
    <Combobox
      items={countries}
      value={selected}
      onValueChange={(country: PickerCountry | null) => {
        if (country !== null) onChange(country.code);
      }}
      itemToStringLabel={getCountrySearchLabel}
      itemToStringValue={(country: PickerCountry) => country.code}
      isItemEqualToValue={(left: PickerCountry, right: PickerCountry) => left.code === right.code}
      locale={i18n.language}
      autoHighlight
    >
      <ComboboxTrigger
        aria-label={t("labels.country")}
        render={<Button type="button" variant="outline" className="cursor-pointer justify-between gap-2 font-normal" />}
      >
        {selected === null ? null : <CountryLabel country={selected} />}
      </ComboboxTrigger>
      <ComboboxContent align="end">
        <ComboboxInput showTrigger={false} placeholder={t("placeholder.searchCountries")} aria-label={t("placeholder.searchCountries")} />
        <ComboboxEmpty>{t("placeholder.noCountriesFound")}</ComboboxEmpty>
        <ComboboxList>
          {(country: PickerCountry) => (
            <ComboboxItem key={country.code} value={country} className="cursor-pointer">
              <CountryLabel country={country} />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
