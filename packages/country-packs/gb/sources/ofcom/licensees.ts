const OPERATOR_NAME_BY_LICENSEE: ReadonlyMap<string, string> = new Map([
  ["EE LIMITED", "EE"],
  ["TELEFONICA UK LIMITED", "O2"],
  ["TELEFÓNICA UK LIMITED", "O2"],
  ["VODAFONE LIMITED", "Vodafone"],
  ["HUTCHISON 3G UK LIMITED", "Three"],
]);
const COMPANY_FORM = /[\s,]+(limited|ltd\.?|plc|llp)$/i;

function normalizedName(publishedName: string): string {
  return publishedName.replace(/\s+/g, " ").trim();
}

export function operatorNameOfLicensee(publishedName: string): string | null {
  return OPERATOR_NAME_BY_LICENSEE.get(normalizedName(publishedName).toUpperCase()) ?? null;
}

export function shortLicenseeName(publishedName: string): string {
  return operatorNameOfLicensee(publishedName) ?? normalizedName(publishedName).replace(COMPANY_FORM, "");
}
