import {
  brands,
  licensees,
  microwaveLinkAntennaTypes,
  microwaveLinkManufacturers,
  microwaveLinkTransmitterTypes,
  microwaveLinks,
  officialDatasets,
  officialLocations,
  officialPermitListings,
  officialPermitSectors,
  officialPermits,
  officialSites,
  operators,
  regions,
} from "@openbts/drizzle";
import { between, eq, gt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { KmzExportContext } from "../../../../core/sources.ts";
import { bucketOf } from "../shared/collections.ts";

type KmzDatabase = KmzExportContext["db"];

export type KmzPermit = Awaited<ReturnType<typeof readPermitPage>>[number];
export type KmzLink = Awaited<ReturnType<typeof readLinkPage>>[number];

const PAGE_SIZE = 10_000;

const transmitterManufacturers = alias(microwaveLinkManufacturers, "transmitter_manufacturers");
const txAntennaTypes = alias(microwaveLinkAntennaTypes, "tx_antenna_types");
const txAntennaManufacturers = alias(microwaveLinkManufacturers, "tx_antenna_manufacturers");
const rxAntennaTypes = alias(microwaveLinkAntennaTypes, "rx_antenna_types");
const rxAntennaManufacturers = alias(microwaveLinkManufacturers, "rx_antenna_manufacturers");

function valuesByPermit<Value>(rows: readonly { permitId: number; value: Value }[]): Map<number, Value[]> {
  const byPermit = new Map<number, Value[]>();
  for (const { permitId, value } of rows) bucketOf(byPermit, permitId).push(value);
  return byPermit;
}

async function readPages<Row extends { id: number }>(readPage: (afterId: number) => Promise<Row[]>): Promise<Row[]> {
  const pages: Row[][] = [];
  let afterId = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- each page starts after the last id of the page before it
    const page = await readPage(afterId);
    pages.push(page);
    const lastId = page.at(-1)?.id;
    if (lastId === undefined || page.length < PAGE_SIZE) return pages.flat();
    afterId = lastId;
  }
}

async function readPermitPage(db: KmzDatabase, afterId: number) {
  const permits = await db
    .select({
      id: officialPermits.id,
      decisionNumber: officialPermits.decision_number,
      decisionType: officialPermits.decision_type,
      expiresOn: officialPermits.expiry_date,
      createdAt: officialPermits.createdAt,
      rat: officialPermits.rat,
      mhz: officialPermits.label_mhz,
      variant: officialPermits.label_variant,
      officialSiteId: officialSites.id,
      siteId: officialSites.station_id,
      operatorName: operators.name,
      color: brands.color,
      longitude: officialLocations.longitude,
      latitude: officialLocations.latitude,
      city: officialLocations.city,
      address: officialLocations.address,
      regionName: regions.name,
      regionCode: regions.code,
    })
    .from(officialPermits)
    .innerJoin(officialSites, eq(officialSites.id, officialPermits.official_site_id))
    .innerJoin(operators, eq(operators.id, officialSites.operator_id))
    .leftJoin(brands, eq(brands.id, operators.brandId))
    .innerJoin(officialLocations, eq(officialLocations.id, officialSites.location_id))
    .innerJoin(regions, eq(regions.id, officialLocations.region_id))
    .where(gt(officialPermits.id, afterId))
    .orderBy(officialPermits.id)
    .limit(PAGE_SIZE);
  const firstId = permits[0]?.id;
  const lastId = permits.at(-1)?.id;
  if (firstId === undefined || lastId === undefined) return [];

  const [sectors, listings] = await Promise.all([
    db
      .select({ permitId: officialPermitSectors.permit_id, value: officialPermitSectors.azimuth })
      .from(officialPermitSectors)
      .where(between(officialPermitSectors.permit_id, firstId, lastId))
      .orderBy(officialPermitSectors.id),
    db
      .select({ permitId: officialPermitListings.permitId, value: officialDatasets.key })
      .from(officialPermitListings)
      .innerJoin(officialDatasets, eq(officialDatasets.id, officialPermitListings.datasetId))
      .where(between(officialPermitListings.permitId, firstId, lastId)),
  ]);
  const azimuthsByPermit = valuesByPermit(sectors);
  const datasetKeysByPermit = valuesByPermit(listings);

  return permits.map(({ rat, mhz, variant, ...permit }) => ({
    ...permit,
    label: { rat, mhz, variant },
    azimuths: azimuthsByPermit.get(permit.id) ?? [],
    datasetKeys: datasetKeysByPermit.get(permit.id) ?? [],
  }));
}

async function readLinkPage(db: KmzDatabase, afterId: number) {
  return db
    .select({
      id: microwaveLinks.id,
      permitNumber: microwaveLinks.permit_number,
      decisionType: microwaveLinks.decision_type,
      expiresOn: microwaveLinks.expiry_date,
      createdAt: microwaveLinks.createdAt,
      licenseeName: licensees.name,
      color: brands.color,
      txLongitude: microwaveLinks.tx_longitude,
      txLatitude: microwaveLinks.tx_latitude,
      txHeight: microwaveLinks.tx_height,
      txCity: microwaveLinks.tx_city,
      txProvince: microwaveLinks.tx_province,
      txStreet: microwaveLinks.tx_street,
      rxLongitude: microwaveLinks.rx_longitude,
      rxLatitude: microwaveLinks.rx_latitude,
      rxHeight: microwaveLinks.rx_height,
      rxCity: microwaveLinks.rx_city,
      rxStreet: microwaveLinks.rx_street,
      freq: microwaveLinks.freq,
      channelWidth: microwaveLinks.ch_width,
      polarization: microwaveLinks.polarization,
      modulationType: microwaveLinks.modulation_type,
      bandwidth: microwaveLinks.bandwidth,
      eirp: microwaveLinks.tx_eirp,
      transmitterType: microwaveLinkTransmitterTypes.name,
      transmitterManufacturer: transmitterManufacturers.name,
      txAntennaType: txAntennaTypes.name,
      txAntennaManufacturer: txAntennaManufacturers.name,
      rxAntennaType: rxAntennaTypes.name,
      rxAntennaManufacturer: rxAntennaManufacturers.name,
    })
    .from(microwaveLinks)
    .leftJoin(licensees, eq(licensees.id, microwaveLinks.operator_id))
    .leftJoin(operators, eq(operators.id, licensees.operatorId))
    .leftJoin(brands, eq(brands.id, sql`CASE WHEN ${licensees.operatorId} IS NULL THEN ${licensees.brandId} ELSE ${operators.brandId} END`))
    .leftJoin(microwaveLinkTransmitterTypes, eq(microwaveLinkTransmitterTypes.id, microwaveLinks.tx_transmitter_type_id))
    .leftJoin(transmitterManufacturers, eq(transmitterManufacturers.id, microwaveLinkTransmitterTypes.manufacturer_id))
    .leftJoin(txAntennaTypes, eq(txAntennaTypes.id, microwaveLinks.tx_antenna_type_id))
    .leftJoin(txAntennaManufacturers, eq(txAntennaManufacturers.id, txAntennaTypes.manufacturer_id))
    .leftJoin(rxAntennaTypes, eq(rxAntennaTypes.id, microwaveLinks.rx_antenna_type_id))
    .leftJoin(rxAntennaManufacturers, eq(rxAntennaManufacturers.id, rxAntennaTypes.manufacturer_id))
    .where(gt(microwaveLinks.id, afterId))
    .orderBy(microwaveLinks.id)
    .limit(PAGE_SIZE);
}

export async function readPermits(db: KmzDatabase): Promise<KmzPermit[]> {
  return readPages((afterId) => readPermitPage(db, afterId));
}

export async function readLinks(db: KmzDatabase): Promise<KmzLink[]> {
  return readPages((afterId) => readLinkPage(db, afterId));
}
