import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import plPLAdmin from "./locales/pl-PL/admin.json";
import plPLAuth from "./locales/pl-PL/auth.json";
import plPLCellAnalyzer from "./locales/pl-PL/cellAnalyzer.json";
import plPLClfExport from "./locales/pl-PL/clfExport.json";
import plPLCommon from "./locales/pl-PL/common.json";
import plPLDeletedEntries from "./locales/pl-PL/deletedEntries.json";
import plPLKMZ from "./locales/pl-PL/kmz.json";
import plPLLists from "./locales/pl-PL/lists.json";
import plPLMain from "./locales/pl-PL/main.json";
import plPLNav from "./locales/pl-PL/nav.json";
import plPLNotifications from "./locales/pl-PL/notifications.json";
import plPLNsg from "./locales/pl-PL/nsg.json";
import plPLOAuth from "./locales/pl-PL/oauth.json";
import plPLPem from "./locales/pl-PL/pem.json";
import plPLSettings from "./locales/pl-PL/settings.json";
import plPLSpectrum from "./locales/pl-PL/spectrum.json";
import plPLStationDetails from "./locales/pl-PL/stationDetails.json";
import plPLStations from "./locales/pl-PL/stations.json";
import plPLStatistics from "./locales/pl-PL/statistics.json";
import plPLSubmissions from "./locales/pl-PL/submissions.json";
import plPLTerrainProfile from "./locales/pl-PL/terrainProfile.json";

export const defaultNS = "common";
export const resources = {
  "pl-PL": {
    common: plPLCommon,
    stations: plPLStations,
    nav: plPLNav,
    main: plPLMain,
    stationDetails: plPLStationDetails,
    submissions: plPLSubmissions,
    clfExport: plPLClfExport,
    auth: plPLAuth,
    settings: plPLSettings,
    admin: plPLAdmin,
    deletedEntries: plPLDeletedEntries,
    statistics: plPLStatistics,
    notifications: plPLNotifications,
    lists: plPLLists,
    cellAnalyzer: plPLCellAnalyzer,
    nsg: plPLNsg,
    spectrum: plPLSpectrum,
    pem: plPLPem,
    kmz: plPLKMZ,
    terrainProfile: plPLTerrainProfile,
    oauth: plPLOAuth,
  },
} as const;

export const supportedLanguages = [
  { code: "en-US", name: "English", nativeName: "English", countryCode: "US" },
  { code: "pl-PL", name: "Polish", nativeName: "Polski", countryCode: "PL" },
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number]["code"];

function getDefaultLanguage(): SupportedLanguage {
  if (typeof window === "undefined") return "pl-PL";

  try {
    const stored = localStorage.getItem("i18nextLng");
    if (stored && (stored === "en-US" || stored === "pl-PL")) return stored;
  } catch {
    // Storage unavailable
  }

  return "pl-PL";
}

export function persistLanguage(code: SupportedLanguage): void {
  try {
    localStorage.setItem("i18nextLng", code);
  } catch {
    // Storage unavailable
  }
}

const initialLanguage = getDefaultLanguage();

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage,
  fallbackLng: "pl-PL",
  defaultNS,
  ns: Object.keys(resources["pl-PL"]),
  interpolation: {
    escapeValue: false,
  },
  react: {
    useSuspense: false,
    bindI18n: "languageChanged loaded",
    bindI18nStore: "added removed",
    transKeepBasicHtmlNodesFor: ["br", "strong", "i", "p", "em"],
  },
});

let englishBundle: Promise<void> | null = null;

export function ensureLanguageResources(language: SupportedLanguage): Promise<void> {
  if (language !== "en-US") return Promise.resolve();

  englishBundle ??= import("./locales/en-US")
    .then(({ enUSResources }) => {
      for (const [namespace, bundle] of Object.entries(enUSResources)) i18n.addResourceBundle("en-US", namespace, bundle, true, true);
    })
    .catch((error: unknown) => {
      englishBundle = null;
      throw error;
    });

  return englishBundle;
}

export const i18nReady = ensureLanguageResources(initialLanguage);
export default i18n;
