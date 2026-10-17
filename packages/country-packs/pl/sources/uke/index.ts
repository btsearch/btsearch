import type { OfficialSourceDefinition } from "../../../core/sources.ts";
import { findOfficialSiteIdsForCells } from "./cellMatch.ts";
import { discoverDeviceRegistry } from "./device-registry/discover.ts";
import { parseDeviceRegistry } from "./device-registry/parse.ts";
import { syncStationNames } from "./device-registry/stationNames.ts";
import { exportKmz } from "./kmz/index.ts";
import { discoverMicrowaveLinks } from "./microwave-links/discover.ts";
import { parseMicrowaveLinks } from "./microwave-links/parse.ts";
import { discoverPermits } from "./permits/discover.ts";
import { parsePermits } from "./permits/parse.ts";
import { operatorNameOfLicensee, shortLicenseeName } from "./shared/licensees.ts";

export const uke: OfficialSourceDefinition = {
  key: "pl-uke",
  countryCode: "PL",
  shortName: "UKE",
  authority: "Urząd Komunikacji Elektronicznej",
  homepageUrl: "https://www.uke.gov.pl",
  licence: "CC BY 4.0 (as listed on dane.gov.pl)",
  attribution: "Source: Urząd Komunikacji Elektronicznej (UKE), bip.uke.gov.pl.",
  isRedistributable: true,
  shortLicenseeName,
  operatorNameOfLicensee,
  datasets: [
    { key: "permits", layer: "sites", checkEveryHours: 6, discover: discoverPermits, parse: parsePermits },
    {
      key: "device-registry",
      layer: "sites",
      checkEveryHours: 6,
      discover: discoverDeviceRegistry,
      parse: parseDeviceRegistry,
      syncSiteNames: syncStationNames,
    },
    { key: "microwave-links", layer: "microwave_links", checkEveryHours: 6, discover: discoverMicrowaveLinks, parse: parseMicrowaveLinks },
  ],
  exportKmz,
  findOfficialSiteIdsForCells,
};
