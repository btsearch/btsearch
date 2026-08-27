import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enUSAdmin from "./locales/en-US/admin.json";
import enUSAuth from "./locales/en-US/auth.json";
import enUSCellAnalyzer from "./locales/en-US/cellAnalyzer.json";
import enUSClfExport from "./locales/en-US/clfExport.json";
import enUSCommon from "./locales/en-US/common.json";
import enUSDeletedEntries from "./locales/en-US/deletedEntries.json";
import enUSKMZ from "./locales/en-US/kmz.json";
import enUSLists from "./locales/en-US/lists.json";
import enUSMain from "./locales/en-US/main.json";
import enUSNav from "./locales/en-US/nav.json";
import enUSNotifications from "./locales/en-US/notifications.json";
import enUSOAuth from "./locales/en-US/oauth.json";
import enUSPem from "./locales/en-US/pem.json";
import enUSSettings from "./locales/en-US/settings.json";
import enUSSpectrum from "./locales/en-US/spectrum.json";
import enUSStationDetails from "./locales/en-US/stationDetails.json";
import enUSStations from "./locales/en-US/stations.json";
import enUSStatistics from "./locales/en-US/statistics.json";
import enUSSubmissions from "./locales/en-US/submissions.json";
import enUSTerrainProfile from "./locales/en-US/terrainProfile.json";
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
  "en-US": {
    common: enUSCommon,
    stations: enUSStations,
    nav: enUSNav,
    main: enUSMain,
    stationDetails: enUSStationDetails,
    submissions: enUSSubmissions,
    clfExport: enUSClfExport,
    auth: enUSAuth,
    settings: enUSSettings,
    admin: enUSAdmin,
    deletedEntries: enUSDeletedEntries,
    statistics: enUSStatistics,
    notifications: enUSNotifications,
    lists: enUSLists,
    cellAnalyzer: enUSCellAnalyzer,
    spectrum: enUSSpectrum,
    pem: enUSPem,
    kmz: enUSKMZ,
    terrainProfile: enUSTerrainProfile,
    oauth: enUSOAuth,
  },
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

  const stored = localStorage.getItem("i18nextLng");
  if (stored && (stored === "en-US" || stored === "pl-PL")) return stored;

  return "pl-PL";
}

void i18n.use(initReactI18next).init({
  resources,
  lng: getDefaultLanguage(),
  fallbackLng: "pl-PL",
  defaultNS,
  ns: [
    "common",
    "stations",
    "nav",
    "map",
    "stationDetails",
    "submissions",
    "clfExport",
    "auth",
    "settings",
    "admin",
    "statistics",
    "notifications",
    "lists",
    "ntmAnalyzer",
    "terrainProfile",
    "oauth",
  ],
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

export default i18n;
