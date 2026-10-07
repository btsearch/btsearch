import { parseCountryCode } from "@/features/admin/reference/utils/countries";
import { joinSearchValues, parseSearchValues } from "@/lib/urlSearch";

export function listCountrySearchCodes(value: unknown): string[] {
  return parseSearchValues(value, (item) => parseCountryCode(item.trim()));
}

export function parseCountrySearch(value: unknown): string | undefined {
  return joinSearchValues(listCountrySearchCodes(value));
}

export function toCountrySearch(countryCodes: readonly string[]): string | undefined {
  return joinSearchValues([...countryCodes].sort());
}
