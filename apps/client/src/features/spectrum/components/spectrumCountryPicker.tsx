import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from "@/components/ui/combobox";
import { CountryCodeTile } from "@/components/ui/countryCodeTile";
import { FacetPill } from "@/features/shared/filterPanel";

export type SpectrumCountry = { code: string; name: string };

type SpectrumCountryPickerProps = {
  countries: readonly SpectrumCountry[];
  value: string;
  onChange: (countryCode: string) => void;
};

const MAX_COUNTRY_PILLS = 5;

function getCountrySearchLabel(country: SpectrumCountry): string {
  return `${country.name} ${country.code}`;
}

function CountryLabel({ country }: { country: SpectrumCountry }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CountryCodeTile code={country.code} size="xs" />
      <span className="truncate">{country.name}</span>
    </span>
  );
}

export function SpectrumCountryPicker({ countries, value, onChange }: SpectrumCountryPickerProps) {
  const { t, i18n } = useTranslation("spectrum");
  const selected = countries.find((country) => country.code === value) ?? null;

  if (countries.length <= MAX_COUNTRY_PILLS) {
    return (
      <div role="group" aria-label={t("country")} className="flex flex-wrap gap-1.5">
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
      onValueChange={(country: SpectrumCountry | null) => {
        if (country !== null) onChange(country.code);
      }}
      itemToStringLabel={getCountrySearchLabel}
      itemToStringValue={(country: SpectrumCountry) => country.code}
      isItemEqualToValue={(left: SpectrumCountry, right: SpectrumCountry) => left.code === right.code}
      locale={i18n.language}
      autoHighlight
    >
      <ComboboxTrigger
        aria-label={t("country")}
        render={<Button type="button" variant="outline" className="cursor-pointer justify-between gap-2 font-normal" />}
      >
        {selected === null ? null : <CountryLabel country={selected} />}
      </ComboboxTrigger>
      <ComboboxContent align="end">
        <ComboboxInput showTrigger={false} placeholder={t("searchCountry")} aria-label={t("searchCountry")} />
        <ComboboxEmpty>{t("noCountryMatches")}</ComboboxEmpty>
        <ComboboxList>
          {(country: SpectrumCountry) => (
            <ComboboxItem key={country.code} value={country} className="cursor-pointer">
              <CountryLabel country={country} />
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
