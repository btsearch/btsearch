export const OPERATOR_NAME_BY_REGISTRY_FILE_KEY: ReadonlyMap<string, string> = new Map([
  ["orange", "Orange"],
  ["p4", "Play"],
  ["t-mobile", "T-Mobile"],
  ["polkomtel", "Plus"],
]);

const OPERATOR_NAME_BY_SHORT_LICENSEE_NAME = new Map([
  ["p4", "Play"],
  ["orange polska", "Orange"],
  ["t-mobile polska", "T-Mobile"],
  ["polkomtel", "Plus"],
  ["pkp polskie linie kolejowe", "PKP PLK"],
  ["tatrzańskie ochotnicze pogotowie ratunkowe", "TOPR"],
]);

const TOKEN_START = String.raw`(?<![\p{L}\p{N}-]\.?)`;
const TOKEN_END = String.raw`(?!\.?[\p{L}\p{N}-])`;
const STRAY_DOT = String.raw`\s*\.?`;

const COMPANY_FORMS = [
  String.raw`sp\.?\s*z\.?\s*o\.?\s*o\.?${TOKEN_END}${STRAY_DOT}`,
  String.raw`s\.?\s*a\.?${TOKEN_END}${STRAY_DOT}`,
  String.raw`spółka z ograniczoną odpowiedzialnością${TOKEN_END}`,
  String.raw`spolka z ograniczona odpowiedzialnoscia${TOKEN_END}`,
  String.raw`sp\.?\s*k\.?${TOKEN_END}${STRAY_DOT}`,
  String.raw`sp\.?\s*j\.?${TOKEN_END}${STRAY_DOT}`,
].map((form) => new RegExp(`${TOKEN_START}${form}`, "giu"));

export function shortLicenseeName(publishedName: string): string {
  const stripped = COMPANY_FORMS.reduce((name, form) => name.replace(form, ""), publishedName)
    .replace(/^\s*[.,-]+\s*/g, "")
    .replace(/\s*[.,-]+\s*$/g, "")
    .replace(/\s+[.,-]+\s+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (stripped.toLowerCase().includes("nordisk")) return "Nordisk";
  return stripped;
}

export function operatorNameOfLicensee(publishedName: string): string | null {
  const registryOperatorName = OPERATOR_NAME_BY_REGISTRY_FILE_KEY.get(publishedName);
  if (registryOperatorName !== undefined) return registryOperatorName;

  const shortName = shortLicenseeName(publishedName);
  if (!shortName) return null;
  return OPERATOR_NAME_BY_SHORT_LICENSEE_NAME.get(shortName.toLowerCase()) ?? shortName;
}
