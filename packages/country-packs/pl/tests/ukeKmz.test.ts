import { destinationPoint } from "@openbts/shared/geo";
import { drizzle } from "drizzle-orm/pg-proxy";
import { strFromU8, unzipSync } from "fflate";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { KmzExportContext } from "../../core/sources.ts";
import { type KmzDocument, writeDocuments } from "../sources/uke/kmz/documents.ts";
import { exportKmz } from "../sources/uke/kmz/index.ts";
import { classifyLinkType, groupIntoLinks, linkDocuments, linksKml } from "../sources/uke/kmz/microwaveLinks.ts";
import { type KmzLink, type KmzPermit, readLinks, readPermits } from "../sources/uke/kmz/read.ts";
import { groupBySite, siteDocuments, sitesKml } from "../sources/uke/kmz/sites.ts";
import { rowsCreatedOnNewestDay } from "../sources/uke/shared/dates.ts";

const DAY = "2026-10-12";
const SOURCE_ID = 7;

const PERMIT: KmzPermit = {
  id: 1,
  decisionNumber: "DZC.WML.514.123.2026",
  decisionType: "permit",
  expiresOn: "2030-06-30",
  createdAt: new Date("2026-09-25T14:15:16.789Z"),
  officialSiteId: 501,
  siteId: "BT12345",
  operatorName: "Orange",
  color: "#F59E0B",
  longitude: 21.0123,
  latitude: 52.2297,
  city: "Warszawa",
  address: 'ul. "Długa" 5 & 7',
  regionName: "Mazowieckie",
  regionCode: "MAZ",
  label: { rat: "LTE", mhz: 800, variant: "commercial" },
  azimuths: [],
  datasetKeys: ["permits"],
};

const LINK: KmzLink = {
  id: 1,
  permitNumber: "RL/15/2026",
  decisionType: "permit",
  expiresOn: "2031-03-31",
  createdAt: new Date("2026-09-25T14:15:16.789Z"),
  licenseeName: "Orange Polska",
  color: "#F59E0B",
  txLongitude: 21.01,
  txLatitude: 52.22,
  txHeight: 110,
  txCity: "Warszawa",
  txProvince: "mazowieckie",
  txStreet: "Długa 5",
  rxLongitude: 21.05,
  rxLatitude: 52.25,
  rxHeight: 120.5,
  rxCity: "Marki",
  rxStreet: null,
  freqKhz: 23_000_000,
  channelWidth: 56,
  polarization: "V",
  modulationType: "128QAM",
  bandwidth: "200",
  eirp: 30.5,
  transmitterType: "RTN 950",
  transmitterManufacturer: "Huawei",
  txAntennaType: "A23 <0.6m>",
  txAntennaManufacturer: null,
  rxAntennaType: null,
  rxAntennaManufacturer: null,
};

const LINK_BACK: KmzLink = {
  ...LINK,
  txLongitude: LINK.rxLongitude,
  txLatitude: LINK.rxLatitude,
  txHeight: LINK.rxHeight,
  rxLongitude: LINK.txLongitude,
  rxLatitude: LINK.txLatitude,
  rxHeight: LINK.txHeight,
};

const PERMITS_IN_TWO_REGIONS: KmzPermit[] = [
  { ...PERMIT, id: 1, createdAt: new Date("2026-09-24T23:59:59.999Z") },
  { ...PERMIT, id: 2, officialSiteId: 502, regionName: "Dolnośląskie", regionCode: "DLN", datasetKeys: ["device-registry"] },
  { ...PERMIT, id: 3, officialSiteId: 503, datasetKeys: ["permits", "device-registry"] },
];

const LINKS_IN_THREE_REGIONS: KmzLink[] = [
  { ...LINK, permitNumber: "RL/1", txProvince: " Mazowieckie " },
  { ...LINK, permitNumber: "RL/1", txProvince: "śląskie", createdAt: new Date("2026-09-26T00:00:00.000Z") },
  { ...LINK, permitNumber: "RL/2", txProvince: "ŚLĄSKIE" },
  { ...LINK, permitNumber: "RL/3", txProvince: "Silesia" },
  { ...LINK, permitNumber: "RL/4", txProvince: null },
];

const directory = mkdtempSync(join(tmpdir(), "uke-kmz-"));
process.on("exit", () => rmSync(directory, { recursive: true, force: true }));

function documentName(document: KmzDocument): string {
  return document.kml.match(/<name>(.*?)<\/name>/)?.[1] ?? "";
}

function pathsHolding(documents: readonly KmzDocument[], text: string): string[] {
  return documents.filter((document) => document.kml.includes(text)).map((document) => document.path);
}

function hop(direction: "there" | "back", freqKhz: number, polarization: string | null): KmzLink {
  return { ...(direction === "there" ? LINK : LINK_BACK), freqKhz, polarization };
}

function databaseHolding(
  table: string,
  ids: readonly number[],
  fill: unknown = null,
): { db: KmzExportContext["db"]; reads: { clause: string; params: unknown[] }[] } {
  const reads: { clause: string; params: unknown[] }[] = [];
  const db = drizzle(async (query: string, params: unknown[]) => {
    if (!query.includes(`from "official"."${table}"`)) return { rows: [] };
    reads.push({ clause: query.slice(query.indexOf(" where ") + 1), params });

    const [afterId, limit] = params.slice(-2) as [number, number];
    const width = query.slice(0, query.indexOf(" from ")).split(", ").length;
    const rows = ids.filter((id) => id > afterId).slice(0, limit);
    return { rows: rows.map((id) => Array.from({ length: width }, (_, column) => (column === 0 ? id : fill))) };
  });
  return { db: db as unknown as KmzExportContext["db"], reads };
}

async function tablesReadByExport(changedDatasets: readonly string[]): Promise<string[]> {
  const queries: string[] = [];
  const db = drizzle(async (query: string) => {
    queries.push(query);
    return { rows: [] };
  });
  await exportKmz({ db: db as unknown as KmzExportContext["db"], sourceId: SOURCE_ID, directory, day: DAY, changedDatasets });
  return ["permits", "microwave_links"].filter((table) => queries.some((query) => query.includes(`from "official"."${table}"`)));
}

void test("exports the stations only after a permits change, and the microwave links only after a links change", async () => {
  assert.deepEqual(await tablesReadByExport(["permits", "device-registry"]), ["permits"]);
  assert.deepEqual(await tablesReadByExport(["microwave-links"]), ["microwave_links"]);
  assert.deepEqual(await tablesReadByExport(["device-registry"]), []);
});

void test("groups permits by official site, in the order the sites are first seen", () => {
  const sites = groupBySite([
    { ...PERMIT, id: 1, azimuths: [120, null, 0] },
    { ...PERMIT, id: 2, officialSiteId: 502, operatorName: "Play", color: null, city: null, azimuths: [null] },
    { ...PERMIT, id: 3, azimuths: [240, 120], city: "Another city on the same site" },
  ]);
  const summaries = sites.map((site) => [
    site.siteId,
    site.operatorName,
    site.color,
    site.city,
    site.permits.map((permit) => permit.id),
    [...site.azimuths],
  ]);

  assert.deepEqual(summaries, [
    ["BT12345", "Orange", "#F59E0B", "Warszawa", [1, 3], [120, 0, 240]],
    ["BT12345", "Play", "#00E1FF", null, [2], []],
  ]);
  assert.deepEqual(groupBySite([]), []);
});

void test("the files of a dataset hold the permits that dataset lists", () => {
  const documents = [
    ...siteDocuments(
      [
        { ...PERMIT, id: 1, decisionNumber: "ONLY-PERMITS", datasetKeys: ["permits"] },
        { ...PERMIT, id: 2, decisionNumber: "ONLY-REGISTRY", datasetKeys: ["device-registry"] },
        { ...PERMIT, id: 3, decisionNumber: "BOTH", datasetKeys: ["device-registry", "permits"] },
        { ...PERMIT, id: 4, decisionNumber: "ANOTHER-DATASET", datasetKeys: ["device_registry"] },
      ],
      DAY,
    ),
  ];
  const everyFile = ["stations_2026-10-12.kmz", "stations_2026-10-12_MAZ.kmz", "stations_new_2026-09-25.kmz"];
  const permitsFiles = ["permits/stations_2026-10-12_permits.kmz", "permits/stations_2026-10-12_permits_MAZ.kmz"];
  const registryFiles = ["device_registry/stations_2026-10-12_device_registry.kmz", "device_registry/stations_2026-10-12_device_registry_MAZ.kmz"];

  assert.deepEqual(pathsHolding(documents, "ONLY-PERMITS").sort(), [...everyFile, ...permitsFiles].sort());
  assert.deepEqual(pathsHolding(documents, "ONLY-REGISTRY").sort(), [...everyFile, ...registryFiles].sort());
  assert.deepEqual(pathsHolding(documents, "BOTH").sort(), [...everyFile, ...permitsFiles, ...registryFiles].sort());
  assert.deepEqual(pathsHolding(documents, "ANOTHER-DATASET").sort(), everyFile);
  assert.deepEqual(pathsHolding(documents, "<b>Permits (4):</b>"), everyFile);
  assert.deepEqual(pathsHolding(documents, "<b>Permits (2):</b>").sort(), [...permitsFiles, ...registryFiles].sort());
});

void test("names the station files as before, by day, dataset and region", () => {
  const documents = [...siteDocuments(PERMITS_IN_TWO_REGIONS, DAY)];

  assert.deepEqual(
    documents.map((document) => [document.path, documentName(document)]),
    [
      ["stations_2026-10-12.kmz", "Pozwolenia UKE"],
      ["stations_2026-10-12_DLN.kmz", "Pozwolenia UKE - DLN"],
      ["stations_2026-10-12_MAZ.kmz", "Pozwolenia UKE - MAZ"],
      ["permits/stations_2026-10-12_permits.kmz", "Pozwolenia UKE - permits"],
      ["permits/stations_2026-10-12_permits_MAZ.kmz", "Pozwolenia UKE - permits - MAZ"],
      ["device_registry/stations_2026-10-12_device_registry.kmz", "Pozwolenia UKE - device_registry"],
      ["device_registry/stations_2026-10-12_device_registry_DLN.kmz", "Pozwolenia UKE - device_registry - DLN"],
      ["device_registry/stations_2026-10-12_device_registry_MAZ.kmz", "Pozwolenia UKE - device_registry - MAZ"],
      ["stations_new_2026-09-25.kmz", "Pozwolenia UKE - nowe (2026-09-25)"],
    ],
  );
  assert.deepEqual(
    [...siteDocuments([], DAY)].map((document) => document.path),
    ["stations_2026-10-12.kmz", "permits/stations_2026-10-12_permits.kmz", "device_registry/stations_2026-10-12_device_registry.kmz"],
  );
});

void test("names the microwave link files as before, by day and by the province of the first entry", () => {
  const documents = [...linkDocuments(LINKS_IN_THREE_REGIONS, DAY)];

  assert.deepEqual(
    documents.map((document) => [document.path, documentName(document), document.kml.split("<Placemark>").length - 1]),
    [
      ["radiolines_2026-10-12.kmz", "Radiolinie UKE", 4],
      ["radiolines_2026-10-12_MAZ.kmz", "Radiolinie UKE - MAZ", 1],
      ["radiolines_2026-10-12_SLK.kmz", "Radiolinie UKE - SLK", 1],
      ["radiolines_2026-10-12_UNKNOWN.kmz", "Radiolinie UKE - UNKNOWN", 2],
      ["radiolines_new_2026-09-26.kmz", "Radiolinie UKE - nowe (2026-09-26)", 1],
    ],
  );
  assert.deepEqual(
    [...linkDocuments([], DAY)].map((document) => document.path),
    ["radiolines_2026-10-12.kmz"],
  );
});

void test("takes the rows created on the newest day, in UTC", () => {
  const lastMoment = { id: 1, createdAt: new Date("2026-10-11T23:59:59.999Z") };
  const firstMoment = { id: 2, createdAt: new Date("2026-10-12T00:00:00.000Z") };
  const weeksBefore = { id: 3, createdAt: new Date("2026-09-25T12:00:00.000Z") };
  const endOfDay = { id: 4, createdAt: new Date("2026-10-12T23:59:59.999Z") };

  assert.deepEqual(rowsCreatedOnNewestDay([lastMoment, firstMoment, weeksBefore, endOfDay]), { day: "2026-10-12", rows: [firstMoment, endOfDay] });
  assert.deepEqual(rowsCreatedOnNewestDay([weeksBefore, lastMoment]), { day: "2026-10-11", rows: [lastMoment] });
  assert.deepEqual(rowsCreatedOnNewestDay([weeksBefore]), { day: "2026-09-25", rows: [weeksBefore] });
  assert.equal(rowsCreatedOnNewestDay([]), null);
});

void test("groups link entries by licensee and permit number, or by the pair of ends when there is no number", () => {
  const groups = groupIntoLinks([
    { ...LINK, freqKhz: 1 },
    { ...LINK_BACK, freqKhz: 2 },
    { ...LINK, freqKhz: 3, licenseeName: "T-Mobile Polska" },
    { ...LINK, freqKhz: 4, licenseeName: null },
    { ...LINK, freqKhz: 5, permitNumber: "" },
    { ...LINK_BACK, freqKhz: 6, permitNumber: "" },
    { ...LINK, freqKhz: 7, permitNumber: "", licenseeName: null },
    { ...LINK, freqKhz: 8, permitNumber: "", rxLatitude: 52.26 },
    { ...LINK, freqKhz: 9, permitNumber: "RL/16/2026" },
  ]);

  assert.deepEqual(
    groups.map((group) => [group.first.freqKhz, group.entries.map((entry) => entry.freqKhz)]),
    [
      [1, [1, 2]],
      [3, [3]],
      [4, [4]],
      [5, [5, 6]],
      [7, [7]],
      [8, [8]],
      [9, [9]],
    ],
  );
  assert.deepEqual(groupIntoLinks([]), []);
});

void test("classifies a link by the entries of its busiest direction", () => {
  const cases: [linkType: string, entries: KmzLink[]][] = [
    ["FDD", [hop("there", 23000, "V")]],
    ["FDD", [hop("there", 23000, "V"), hop("back", 22000, "V")]],
    ["2+0 FDD", [hop("there", 23000, "V"), hop("there", 23028, "V")]],
    ["2+0 FDD", [hop("there", 23000, null), hop("there", 23028, null), hop("back", 22000, "H")]],
    ["XPIC", [hop("there", 23000, "V"), hop("there", 23000, "H")]],
    ["XPIC", [hop("back", 22000, "V"), hop("there", 23000, "V"), hop("there", 23000, null)]],
    ["SD", [hop("there", 23000, "V"), hop("there", 23000, "V")]],
    ["SD", [hop("there", 23000, null), hop("there", 23000, null), hop("back", 22000, "H"), hop("back", 22028, "V")]],
    ["UNKNOWN", [hop("there", 23000, "V"), hop("there", 23028, "H")]],
    ["UNKNOWN", [hop("there", 23000, "V"), hop("there", 23000, "H"), hop("there", 23028, "H")]],
    ["2+0 FDD", [hop("there", 23000, "V"), hop("back", 22000, "V"), hop("there", 23028, "V"), hop("back", 22000, "H")]],
    ["XPIC", [hop("back", 22000, "V"), hop("there", 23000, "V"), hop("there", 23028, "V"), hop("back", 22000, "H")]],
  ];

  for (const [linkType, entries] of cases) {
    const summary = entries.map((entry) => `${entry.txLatitude}:${entry.freqKhz}:${entry.polarization}`).join(" ");
    assert.equal(classifyLinkType(entries), linkType, summary);
    assert.deepEqual(
      groupIntoLinks(entries).map((group) => group.linkType),
      [linkType],
      summary,
    );
  }
});

void test("writes one site as a point with its permits, and one line for each azimuth", () => {
  const [north, east] = destinationPoint(52.2297, 21.0123, 120, 300);
  const kml = sitesKml(
    groupBySite([
      { ...PERMIT, id: 1, azimuths: [120, null] },
      {
        ...PERMIT,
        id: 2,
        decisionNumber: "BT/<7>",
        decisionType: "permit_change",
        expiresOn: null,
        label: { rat: "GSM", mhz: 900, variant: "railway" },
      },
      { ...PERMIT, id: 3, decisionNumber: "DZC.WML.514.124.2026", azimuths: [120] },
    ]),
    "Pozwolenia UKE",
  );

  assert.equal(
    kml,
    `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>Pozwolenia UKE</name>
<Style id="station-icon-F59E0B">
<IconStyle>
<color>ff0B9EF5</color>
<scale>0.9</scale>
<Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon>
</IconStyle>
<LabelStyle><scale>0.7</scale></LabelStyle>
</Style>
<Style id="azimuth-F59E0B">
<LineStyle><color>ff0B9EF5</color><width>3</width></LineStyle>
</Style>
<Folder><name>Stacje</name><open>1</open><visibility>0</visibility>
<Folder><name>Orange</name><open>0</open><visibility>0</visibility>
<Placemark>
<name>BT12345</name>
<visibility>0</visibility>
<description><![CDATA[<b>Bands:</b> LTE 800, GSM-R 900<br/><b>City:</b> Warszawa<br/><b>Address:</b> ul. &quot;Długa&quot; 5 &amp; 7<br/><b>Region:</b> Mazowieckie<br/><b>Azimuths:</b> 120°<br/><br/><b>Permits (3):</b><br/>LTE 800: DZC.WML.514.123.2026 [P] - expires 2030-06-30<br/>GSM-R 900: BT/&lt;7&gt; [zmP] - no expiry<br/>LTE 800: DZC.WML.514.124.2026 [P] - expires 2030-06-30]]></description>
<styleUrl>#station-icon-F59E0B</styleUrl>

<Point><coordinates>21.0123,52.2297,0</coordinates></Point>
</Placemark>
</Folder>
</Folder>
<Folder><name>Azymuty</name><open>0</open><visibility>0</visibility>
<Folder><name>Orange</name><open>0</open><visibility>0</visibility>
<Placemark>
<name>BT12345</name>
<visibility>0</visibility>
<description><![CDATA[<b>Azimuth:</b> 120°]]></description>
<styleUrl>#azimuth-F59E0B</styleUrl>

<LineString><coordinates>21.0123,52.2297,0 ${east},${north},0</coordinates></LineString>
</Placemark>
</Folder>
</Folder>
</Document>
</kml>`,
  );
  assert.ok(east > 21.0123 && north < 52.2297);
});

void test("a site without a city, an address, a brand or an azimuth still gets its folders", () => {
  const permit: KmzPermit = { ...PERMIT, operatorName: "A & B", color: null, city: null, address: "", azimuths: [null] };
  const kml = sitesKml(groupBySite([permit]), "Pozwolenia UKE - MAZ");

  assert.ok(kml.includes("<name>Pozwolenia UKE - MAZ</name>"));
  assert.ok(kml.includes('<Style id="station-icon-00E1FF">') && kml.includes("<color>ffFFE100</color>"));
  assert.ok(kml.includes("<description><![CDATA[<b>Bands:</b> LTE 800<br/><b>Region:</b> Mazowieckie<br/><br/><b>Permits (1):</b><br/>LTE 800: "));
  assert.ok(kml.endsWith("<Folder><name>A &amp; B</name><open>0</open><visibility>0</visibility>\n\n</Folder>\n</Folder>\n</Document>\n</kml>"));
});

void test("writes one link as a line with both directions, its speed and its equipment", () => {
  const kml = linksKml(groupIntoLinks([LINK, { ...LINK_BACK, freqKhz: 22_000_000, modulationType: null, eirp: null }]), "Radiolinie UKE");

  assert.equal(
    kml,
    `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>Radiolinie UKE</name>
<Style id="line-op-orange-polska">
<LineStyle><color>b30B9EF5</color><width>2</width></LineStyle>
</Style>
<Folder><name>Orange Polska (1)</name><open>0</open><visibility>0</visibility>
<Folder><name>FDD (1)</name><open>1</open><visibility>0</visibility>
<Placemark>
<name>23 GHz [FDD]</name>
<visibility>0</visibility>
<description><![CDATA[<b>Operator:</b> Orange Polska<br/><b>Permit:</b> RL/15/2026 [P]<br/><b>Link Type:</b> FDD<br/><b>Distance:</b> 4.31 km<br/><b>Downlink:</b> 333 Mbps<br/><b>Expires:</b> 2031-03-31<br/><br/><b>TX:</b> Warszawa Długa 5 (52.220000, 21.010000) H: 110m<br/><b>RX:</b> Marki  (52.250000, 21.050000) H: 120.5m<br/><br/><b>Directions:</b><br/>A→B | 23 GHz | V | 56 MHz | 128QAM | 333 Mbps | EIRP: 30.5 dBm<br/>B→A | 22 GHz | V | 56 MHz | 200 Mbps<br/><br/><b>Equipment:</b><br/>TX Radio: RTN 950 (Huawei)<br/>TX Antenna: A23 &lt;0.6m&gt;]]></description>
<styleUrl>#line-op-orange-polska</styleUrl>

<LineString><coordinates>21.01,52.22,0 21.05,52.25,0</coordinates></LineString>
</Placemark>
</Folder>
</Folder>
</Document>
</kml>`,
  );
});

void test("a link without a licensee is filed under Unknown in the default color, and licensees are sorted by name", () => {
  const kml = linksKml(
    groupIntoLinks([
      { ...LINK, permitNumber: "RL/1", licenseeName: null, color: null, transmitterType: null, txAntennaType: null },
      { ...LINK, permitNumber: "RL/2", licenseeName: "Energa-Operator", color: null, channelWidth: null, eirp: 0, bandwidth: "2x1000" },
      { ...LINK, permitNumber: "RL/2", licenseeName: "Energa-Operator", color: null, channelWidth: null, freqKhz: 23_028_000, bandwidth: "1500" },
      { ...LINK, permitNumber: "RL/3", licenseeName: "Energa Operator", color: "#123ABC", freqKhz: 800_000 },
    ]),
    "Radiolinie UKE - nowe (2026-09-25)",
  );

  assert.deepEqual(kml.match(/<Style id="[^"]+">\n<LineStyle><color>\w+/g), [
    '<Style id="line-op-unknown">\n<LineStyle><color>b3FFE100',
    '<Style id="line-op-energa-operator">\n<LineStyle><color>b3FFE100',
  ]);
  assert.deepEqual(kml.match(/<Folder><name>[^<]+/g), [
    "<Folder><name>Energa Operator (1)",
    "<Folder><name>FDD (1)",
    "<Folder><name>Energa-Operator (1)",
    "<Folder><name>2+0 FDD (1)",
    "<Folder><name>Unknown (1)",
    "<Folder><name>FDD (1)",
  ]);
  const directions = ["A→B | 23 GHz | V | 128QAM | 2x1000 | EIRP: 0 dBm", "A→B | 23.0 GHz | V | 128QAM | 1.50 Gbps | EIRP: 30.5 dBm"];

  assert.ok(kml.includes("<name>800 MHz [FDD]</name>"));
  assert.ok(kml.includes(`<b>Directions:</b><br/>${directions.join("<br/>")}<br/><br/><b>Equipment:</b>`));
  assert.ok(kml.includes("<b>Operator:</b> Unknown<br/>") && kml.includes("| EIRP: 30.5 dBm]]></description>"));
});

void test("a written file is a zip that holds the document as doc.kml", async () => {
  const documents: KmzDocument[] = [
    { path: "stations_2026-10-12.kmz", kml: "<kml>Zażółć gęślą jaźń</kml>" },
    { path: "device_registry/stations_2026-10-12_device_registry.kmz", kml: "<kml/>" },
  ];
  const written = await writeDocuments(join(directory, DAY, "stations"), documents);

  assert.deepEqual(written, [
    join(directory, DAY, "stations", "stations_2026-10-12.kmz"),
    join(directory, DAY, "stations", "device_registry", "stations_2026-10-12_device_registry.kmz"),
  ]);
  for (const [index, document] of documents.entries()) {
    const unzipped = unzipSync(readFileSync(written[index] ?? ""));

    assert.deepEqual(Object.keys(unzipped), ["doc.kml"]);
    assert.equal(strFromU8(unzipped["doc.kml"] ?? new Uint8Array()), document.kml);
  }
});

void test("reads permits in id order, each page after the last id of the page before, until a short page", async () => {
  const ids = Array.from({ length: 20_003 }, (_, index) => 2 * index + 1);
  const { db, reads } = databaseHolding("permits", ids, "1");
  const clause = 'where (("official"."sites"."source_id" = $1) and ("official"."permits"."id" > $2)) order by "official"."permits"."id" limit $3';

  assert.deepEqual(
    (await readPermits(db, SOURCE_ID)).map((permit) => permit.id),
    ids,
  );
  assert.deepEqual(reads, [
    { clause, params: [SOURCE_ID, 0, 10_000] },
    { clause, params: [SOURCE_ID, 19_999, 10_000] },
    { clause, params: [SOURCE_ID, 39_999, 10_000] },
  ]);
});

void test("reads microwave links the same way, and a full last page ends on an empty one", async () => {
  const ids = Array.from({ length: 10_000 }, (_, index) => index + 1);
  const { db, reads } = databaseHolding("microwave_links", ids);
  const clause =
    'where (("official"."microwave_links"."dataset_id" in (select "id" from "official"."datasets" where "official"."datasets"."source_id" = $1)) and ("official"."microwave_links"."id" > $2)) order by "official"."microwave_links"."id" limit $3';

  assert.deepEqual(
    (await readLinks(db, SOURCE_ID)).map((link) => link.id),
    ids,
  );
  assert.deepEqual(reads, [
    { clause, params: [SOURCE_ID, 0, 10_000] },
    { clause, params: [SOURCE_ID, 10_000, 10_000] },
  ]);

  const empty = databaseHolding("microwave_links", []);
  assert.deepEqual(await readLinks(empty.db, SOURCE_ID), []);
  assert.deepEqual(empty.reads, [{ clause, params: [SOURCE_ID, 0, 10_000] }]);
});
