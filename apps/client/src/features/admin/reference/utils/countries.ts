import type { CountryOption } from "@/features/admin/users/utils/grants";

export type { CountryOption } from "@/features/admin/users/utils/grants";

const ANY_CASE_COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/i;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const NON_COUNTRY_CODES = ["EU", "EZ", "UN", "QO", "ZZ", "XA", "XB", "AC", "CP", "CQ", "DG", "EA", "IC", "TA"];
const RETIRED_COUNTRY_CODES = ["AN", "BU", "CS", "DD", "DY", "FX", "HV", "NH", "RH", "SU", "TP", "UK", "VD", "YD", "YU", "ZR"];
const EXCLUDED_CODES: ReadonlySet<string> = new Set([...NON_COUNTRY_CODES, ...RETIRED_COUNTRY_CODES]);

const countriesByLanguage = new Map<string, CountryOption[]>();

function isCanonicalRegionCode(code: string): boolean {
  try {
    return new Intl.Locale(`und-${code}`).region === code;
  } catch {
    return true;
  }
}

function listNamedCountries(language: string): CountryOption[] {
  const names = new Intl.DisplayNames([language], { type: "region", fallback: "none" });
  const countries: CountryOption[] = [];
  for (const first of LETTERS) {
    for (const second of LETTERS) {
      const code = `${first}${second}`;
      if (EXCLUDED_CODES.has(code) || !isCanonicalRegionCode(code)) continue;
      const name = names.of(code);
      if (name !== undefined) countries.push({ code, name });
    }
  }
  return countries.sort((left, right) => left.name.localeCompare(right.name, language));
}

function getNamedCountries(language: string): CountryOption[] {
  let countries = countriesByLanguage.get(language);
  if (!countries) {
    countries = listNamedCountries(language);
    countriesByLanguage.set(language, countries);
  }
  return countries;
}

export function parseCountryCode(text: string): string | null {
  return ANY_CASE_COUNTRY_CODE_PATTERN.test(text) ? text.toUpperCase() : null;
}

export function listSelectableCountries(language: string, existingCodes: readonly string[]): CountryOption[] {
  const existing = new Set(existingCodes);
  try {
    return getNamedCountries(language).filter((country) => !existing.has(country.code));
  } catch {
    return [];
  }
}
