import type { Country, Operator } from "@openbts/shared/contract";

export function listRegisterOperators(operators: readonly Operator[], countries: readonly Pick<Country, "code" | "capabilities">[]): Operator[] {
  const registerCountryCodes = new Set(countries.filter((country) => country.capabilities.official).map((country) => country.code));
  return operators.filter((operator) => registerCountryCodes.has(operator.countryCode));
}
