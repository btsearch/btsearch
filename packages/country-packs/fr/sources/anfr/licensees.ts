const OPERATOR_NAME_BY_LICENSEE: ReadonlyMap<string, string> = new Map([
  ["ORANGE", "Orange"],
  ["SFR", "SFR"],
  ["FREE MOBILE", "Free"],
  ["BOUYGUES TELECOM", "Bouygues Telecom"],
]);

function normalizedName(publishedName: string): string {
  return publishedName.replace(/\s+/g, " ").trim();
}

export function operatorNameOfLicensee(publishedName: string): string | null {
  return OPERATOR_NAME_BY_LICENSEE.get(normalizedName(publishedName).toUpperCase()) ?? null;
}

export function shortLicenseeName(publishedName: string): string {
  return operatorNameOfLicensee(publishedName) ?? normalizedName(publishedName);
}
