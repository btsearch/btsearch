import enUS from "./en-US/notifications.js";
import plPL from "./pl-PL/notifications.js";

const translations = { "en-US": enUS, "pl-PL": plPL } as const;

type Locale = keyof typeof translations;
type Namespace = keyof (typeof translations)["en-US"];

function resolveLocale(locale: string | null | undefined): Locale {
  if (locale && locale in translations) return locale as Locale;
  return "pl-PL";
}

type NotificationNamespace = Exclude<Namespace, "labels">;

export function t<N extends NotificationNamespace>(namespace: N, locale: string | null | undefined): { title: string; body: string } {
  return translations[resolveLocale(locale)][namespace];
}

export function getLabels(locale: string | null | undefined) {
  return translations[resolveLocale(locale)].labels;
}
