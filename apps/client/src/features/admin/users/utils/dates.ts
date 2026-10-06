export function formatLongDate(dateString: string, language: string): string {
  return new Date(dateString).toLocaleDateString(language, { year: "numeric", month: "long", day: "numeric" });
}
