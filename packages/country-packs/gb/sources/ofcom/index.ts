import type { OfficialSourceDefinition } from "../../../core/sources.ts";
import { discoverFixedLinks } from "./discover.ts";
import { operatorNameOfLicensee, shortLicenseeName } from "./licensees.ts";
import { parseFixedLinks } from "./parse.ts";

export const ofcom: OfficialSourceDefinition = {
  key: "gb-ofcom",
  countryCode: "GB",
  shortName: "Ofcom",
  authority: "Office of Communications",
  homepageUrl: "https://www.ofcom.org.uk",
  licence: "Open Government Licence v3.0",
  attribution: "Contains public sector information licensed under the Open Government Licence v3.0 (Ofcom, Wireless Telegraphy Register).",
  isRedistributable: true,
  shortLicenseeName,
  operatorNameOfLicensee,
  datasets: [
    {
      key: "fixed-links",
      layer: "microwave_links",
      permitKind: "licence",
      checkEveryHours: 24,
      discover: discoverFixedLinks,
      parse: parseFixedLinks,
    },
  ],
};
