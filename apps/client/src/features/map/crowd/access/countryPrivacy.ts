import type { Country } from "@openbts/shared/contract";

export function isObservationCountryPrivate(countries: readonly Country[] | undefined, countryCode: string | null): boolean {
  if (countryCode === null) return false;
  return countries?.find((country) => country.code === countryCode)?.features.observationsPublic === false;
}

export function readPrivateCountriesOnScreen(countries: readonly Country[] | undefined, countryCodes: readonly string[], isAdmin: boolean) {
  const privateCount = countryCodes.filter((countryCode) => isObservationCountryPrivate(countries, countryCode)).length;
  return {
    hidesPrivateCountries: !isAdmin && privateCount > 0,
    isTrailsBlocked: !isAdmin && privateCount > 0 && privateCount === countryCodes.length,
  };
}
