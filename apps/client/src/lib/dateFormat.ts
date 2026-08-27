const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function getDateFormatter(locale: string) {
  let formatter = dateFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric" });
    dateFormatters.set(locale, formatter);
  }
  return formatter;
}
