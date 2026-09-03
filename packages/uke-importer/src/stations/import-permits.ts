import { deletedEntries, ukePermits } from "@openbts/drizzle";
import { and, eq, lt } from "drizzle-orm";
/* eslint-disable no-await-in-loop */
import path from "node:path";
import { URL } from "node:url";

import { BATCH_SIZE, DOWNLOAD_DIR, REGION_BY_TERYT_PREFIX, STATIONS_URL } from "../config.js";
import { db } from "../database.js";
import { getLastImportedFileNames, recordImportMetadata } from "../import-check.js";
import { findCreatedPermitStationIds } from "../permit-activity.js";
import { scrapeXlsxLinks } from "../scrape.js";
import type { RawUkeData } from "../types.js";
import { getUkeStationKey, loadInternalStationIdByPermit, refreshUkeStationActivity, resolveUkeStationIds } from "../uke-stations.js";
import { getOperators, upsertBands, upsertRegions, upsertUkeLocations } from "../upserts.js";
import {
  chunk,
  convertDMSToDD,
  createLogger,
  downloadFile,
  ensureDownloadDir,
  parseExcelDate,
  parseFileDateWithImportTime,
  readSheetAsJson,
  stripCompanySuffixForName,
} from "../utils.js";
import { type BandKey, getBandMapKey, parseBandFromLabel } from "./bands.js";

interface FileLink {
  href: string;
  text: string;
}

interface PermitFile {
  label: string;
  filePath: string;
  fileDate: Date;
  rowCount: number;
}

interface LocationItem {
  regionName: string;
  city: string | null;
  address: string | null;
  lon: number;
  lat: number;
}

interface DownloadedPermitData {
  operatorNames: Set<string>;
  locations: LocationItem[];
  locationCount: number;
  files: PermitFile[];
  totalRowCount: number;
}

const logger = createLogger("stations");

function getPermitFileName(link: FileLink): string {
  const label = link.text || path.basename(new URL(link.href).pathname);
  return `${label.replace(/\s+/g, "_").replace("_plik_XLSX", "")}.xlsx`;
}

function collectRowMetadata(row: RawUkeData, operatorNames: Set<string>, locationByCoordinates: Map<string, LocationItem>): boolean {
  const fullOperatorName = String(row["Nazwa Operatora"] || "").trim();
  if (fullOperatorName) operatorNames.add(fullOperatorName);

  const teryt = String(row.TERYT || "");
  const prefix = teryt.slice(0, 2);
  const region = REGION_BY_TERYT_PREFIX[prefix];
  if (!region) {
    logger.warn(`Warning: No region found for TERYT prefix: ${prefix} (full TERYT: ${teryt})`);
    return false;
  }

  const lon = convertDMSToDD(row["Dł geogr stacji"]);
  const lat = convertDMSToDD(row["Szer geogr stacji"]);
  if (lon === null || lat === null) {
    logger.warn(`Warning: Invalid coordinates for station ID ${row.IdStacji} GPS(${row["Dł geogr stacji"]}, ${row["Szer geogr stacji"]})`);
    return false;
  }

  const locationKey = `${lon}:${lat}`;
  if (!locationByCoordinates.has(locationKey)) {
    locationByCoordinates.set(locationKey, {
      regionName: region.name,
      city: row.Miejscowość || null,
      address: row.Lokalizacja || null,
      lon,
      lat,
    });
  }

  return true;
}

async function downloadPermitData(links: FileLink[]): Promise<DownloadedPermitData> {
  const operatorNames = new Set<string>();
  const locationByCoordinates = new Map<string, LocationItem>();
  const files: PermitFile[] = [];
  const importTime = new Date();
  let locationCount = 0;
  let totalRowCount = 0;

  for (const [index, link] of links.entries()) {
    const fileName = getPermitFileName(link);
    const filePath = path.join(DOWNLOAD_DIR, `${index}-${fileName}`);
    logger.log(`Downloading: ${fileName}`);
    await downloadFile(link.href, filePath);

    const rows = readSheetAsJson<RawUkeData>(filePath);
    logger.log(`Read ${rows.length} rows`);
    totalRowCount += rows.length;
    files.push({ label: link.text, filePath, fileDate: parseFileDateWithImportTime(link.href, importTime), rowCount: rows.length });

    for (const row of rows) {
      if (collectRowMetadata(row, operatorNames, locationByCoordinates)) locationCount++;
    }
  }

  return { operatorNames, locations: [...locationByCoordinates.values()], locationCount, files, totalRowCount };
}

async function insertUkePermits(
  raws: RawUkeData[],
  bandMap: Map<string, number>,
  operatorIdByName: Map<string, number>,
  locationIdByLonLat: Map<string, number>,
  fileLabel: string,
  fileDate: Date,
): Promise<void> {
  const bandKey = parseBandFromLabel(fileLabel);
  if (!bandKey) {
    logger.warn(`Warning: Could not parse band from file label: ${fileLabel}`);
    return;
  }

  const bandId = bandMap.get(getBandMapKey(bandKey));
  if (!bandId) {
    logger.warn(`Warning: No band ID found for band ${bandKey.rat}${bandKey.value} (${bandKey.variant}) in file: ${fileLabel}`);
    return;
  }

  const values = raws
    .map((row) => {
      const lon = convertDMSToDD(row["Dł geogr stacji"]) ?? null;
      const lat = convertDMSToDD(row["Szer geogr stacji"]) ?? null;
      if (!lon || !lat) {
        logger.warn(`Warning: Invalid coordinates for station ID ${row.IdStacji} GPS(${row["Dł geogr stacji"]}, ${row["Szer geogr stacji"]})`);
        return null;
      }

      const permitDate = parseExcelDate(row["Data ważności"]);
      const operatorName = stripCompanySuffixForName(String(row["Nazwa Operatora"] || "").trim());
      const operatorId = operatorIdByName.get(operatorName) ?? null;
      if (!operatorId) {
        logger.warn(`Warning: No operator ID found for operator name: ${operatorName} Station ID: ${row.IdStacji}`);
        return null;
      }

      const locationKey = `${lon}:${lat}`;
      const locationId = locationIdByLonLat.get(locationKey) ?? null;
      if (!locationId) {
        logger.warn(`Warning: No location ID found for coordinates GPS(${lon}, ${lat}) Station ID: ${row.IdStacji}`);
        return null;
      }

      return {
        station: {
          station_id: String(row.IdStacji || "").trim(),
          operator_id: operatorId,
          location_id: locationId,
          createdAt: fileDate,
          updatedAt: fileDate,
        },
        permit: {
          decision_number: String(row["Nr Decyzji"] || "").trim(),
          decision_type: (row["Rodzaj decyzji"] ?? "P") as "zmP" | "P",
          expiry_date: permitDate,
          band_id: bandId,
          source: "permits" as const,
          createdAt: fileDate,
          updatedAt: fileDate,
        },
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  const stationIdByKey = await resolveUkeStationIds(values.map((value) => value.station));
  const permitValues = values
    .map((value) => {
      const ukeStationId = stationIdByKey.get(getUkeStationKey(value.station));
      if (ukeStationId === undefined) {
        logger.warn(`Warning: Could not resolve UKE station ID for station ${value.station.station_id}`);
        return null;
      }
      return { ...value.permit, uke_station_id: ukeStationId };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  const createdPermitStationIds = await findCreatedPermitStationIds(permitValues);

  for (const group of chunk(permitValues, BATCH_SIZE)) {
    await db
      .insert(ukePermits)
      .values(group)
      .onConflictDoUpdate({
        target: [ukePermits.uke_station_id, ukePermits.band_id, ukePermits.decision_number, ukePermits.decision_type, ukePermits.expiry_date],
        set: { updatedAt: fileDate, source: "permits" },
      });
  }

  await refreshUkeStationActivity(createdPermitStationIds);
}

async function archiveAndDeleteStalePermits(files: PermitFile[], bandMap: Map<string, number>, importMetadataId: number): Promise<number> {
  let staleCount = 0;

  for (const file of files) {
    const band = parseBandFromLabel(file.label);
    if (!band) continue;

    const bandId = bandMap.get(getBandMapKey(band));
    if (!bandId) continue;

    const stalePermits = await db
      .select()
      .from(ukePermits)
      .where(and(eq(ukePermits.source, "permits"), eq(ukePermits.band_id, bandId), lt(ukePermits.updatedAt, file.fileDate)));

    if (stalePermits.length === 0) continue;

    const affectedStationIds = stalePermits.map((permit) => permit.uke_station_id);
    const internalStationIdByPermit = await loadInternalStationIdByPermit(stalePermits.map((permit) => permit.id));

    for (const group of chunk(stalePermits, BATCH_SIZE)) {
      await db.insert(deletedEntries).values(
        group.map((permit) => ({
          source_table: "uke_permits",
          source_id: permit.id,
          source_type: "permits",
          data: { ...permit, internal_station_id: internalStationIdByPermit.get(permit.id) ?? null },
          import_id: importMetadataId,
        })),
      );
    }

    await db.delete(ukePermits).where(and(eq(ukePermits.source, "permits"), eq(ukePermits.band_id, bandId), lt(ukePermits.updatedAt, file.fileDate)));
    await refreshUkeStationActivity(affectedStationIds);
    staleCount += stalePermits.length;
  }

  return staleCount;
}

export async function importPermits(): Promise<boolean> {
  logger.log("Starting stations import...");
  logger.log("Scraping file links from:", STATIONS_URL);
  const links = await scrapeXlsxLinks(STATIONS_URL);
  logger.log(`Found ${links.length} files to process`);

  const previousFileNames = await getLastImportedFileNames("permits");
  const newLinks = previousFileNames ? links.filter((link) => !previousFileNames.has(link.href.split("/").pop() ?? link.href)) : links;

  if (newLinks.length === 0) {
    if (previousFileNames && previousFileNames.size !== links.length) {
      logger.log("No new files to process, updating metadata");
      await recordImportMetadata("permits", links, "success");
    } else {
      logger.log("Data is up-to-date, skipping import");
    }
    return false;
  }

  logger.log(`Processing ${newLinks.length} new file(s) (skipping ${links.length - newLinks.length} already imported)`);

  ensureDownloadDir();
  logger.log("Parsing band information from file labels...");
  const bandKeys: BandKey[] = [];
  for (const link of newLinks) {
    const band = parseBandFromLabel(link.text || link.href);
    if (band) bandKeys.push(band);
  }
  logger.log(
    `Found ${bandKeys.length} bands:`,
    bandKeys.map((band) => `${band.rat}${band.value}${band.variant === "railway" ? " (R)" : ""}`).join(", "),
  );

  const bandMap = await upsertBands(bandKeys);
  logger.log("Upserting regions...");
  const regionItems = Object.values(REGION_BY_TERYT_PREFIX);
  const regionIds = await upsertRegions(regionItems);

  const downloaded = await downloadPermitData(newLinks);
  logger.log(`Processed a total of ${downloaded.totalRowCount} rows`);
  logger.log(`Found ${downloaded.operatorNames.size} unique operators`);
  logger.log(`Found ${downloaded.locationCount} locations`);

  logger.log("Upserting operators...");
  const operatorIdByName = await getOperators(Array.from(downloaded.operatorNames));
  logger.log("Upserting locations...");
  const locationIdByLonLat = await upsertUkeLocations(downloaded.locations, regionIds);

  logger.log("Inserting permits...");
  for (const file of downloaded.files) {
    const rows = readSheetAsJson<RawUkeData>(file.filePath);
    logger.log(`Processing: ${file.label} (${file.rowCount} rows)`);
    await insertUkePermits(rows, bandMap, operatorIdByName, locationIdByLonLat, file.label, file.fileDate);
  }

  const importMetadataId = await recordImportMetadata("permits", links, "success");

  logger.log("Deleting stale station permits...");
  const staleCount = await archiveAndDeleteStalePermits(downloaded.files, bandMap, importMetadataId);
  logger.log(`Deleted ${staleCount} stale station permits`);

  logger.log("Import completed successfully");
  return true;
}
