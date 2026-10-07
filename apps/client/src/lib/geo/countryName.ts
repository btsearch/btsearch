const countryNameFormatters = new Map<string, Intl.DisplayNames>();

function getCountryNameFormatter(language: string): Intl.DisplayNames {
  let formatter = countryNameFormatters.get(language);
  if (formatter === undefined) {
    formatter = new Intl.DisplayNames([language], { type: "region" });
    countryNameFormatters.set(language, formatter);
  }
  return formatter;
}

export function getCountryName(countryCode: string, language: string): string {
  try {
    return getCountryNameFormatter(language).of(countryCode) ?? countryCode;
  } catch {
    return countryCode;
  }
}
