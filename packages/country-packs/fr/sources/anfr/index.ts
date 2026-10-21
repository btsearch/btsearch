import type { OfficialSourceDefinition } from "../../../core/sources.ts";
import { discoverRadioInstallations } from "./discover.ts";
import { operatorNameOfLicensee, shortLicenseeName } from "./licensees.ts";
import { parseRadioInstallations } from "./parse.ts";

export const anfr: OfficialSourceDefinition = {
  key: "fr-anfr",
  countryCode: "FR",
  shortName: "ANFR",
  authority: "Agence nationale des fréquences",
  homepageUrl: "https://www.anfr.fr",
  licence: "Licence Ouverte / Open Licence 2.0 (Etalab)",
  attribution: "Source: Agence nationale des fréquences (ANFR), data.gouv.fr.",
  isRedistributable: true,
  shortLicenseeName,
  operatorNameOfLicensee,
  datasets: [
    {
      key: "mobile-networks",
      layer: "sites",
      permitKind: "inventory",
      checkEveryHours: 24,
      discover: discoverRadioInstallations,
      parse: parseRadioInstallations,
    },
  ],
};
