import assert from "node:assert/strict";
import test from "node:test";

import { findOfficialSiteIdsForCells } from "../sources/uke/cellMatch.ts";
import { syncStationNames } from "../sources/uke/device-registry/stationNames.ts";
import { uke } from "../sources/uke/index.ts";
import { exportKmz } from "../sources/uke/kmz/index.ts";
import { operatorNameOfLicensee, shortLicenseeName } from "../sources/uke/shared/licensees.ts";

const { datasets, ...description } = uke;

void test("describes UKE with the texts the migration stores", () => {
  assert.deepEqual(description, {
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
    exportKmz,
    findOfficialSiteIdsForCells,
  });
});

void test("UKE has three datasets, checked every six hours", () => {
  const summaries = datasets.map((dataset) => [dataset.key, dataset.layer, dataset.checkEveryHours]);

  assert.deepEqual(summaries, [
    ["permits", "sites", 6],
    ["device-registry", "sites", 6],
    ["microwave-links", "microwave_links", 6],
  ]);
  for (const dataset of datasets) {
    assert.equal(typeof dataset.discover, "function", dataset.key);
    assert.equal(typeof dataset.parse, "function", dataset.key);
  }
});

void test("only the device registry syncs site names", () => {
  const siteNameSyncs = datasets.map((dataset) => (dataset.layer === "sites" ? dataset.syncSiteNames : undefined));

  assert.deepEqual(siteNameSyncs, [undefined, syncStationNames, undefined]);
});
