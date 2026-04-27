import { deletedEntries, extraIdentificators, type ratEnum, stations, ukePermitSectors, ukePermits } from "@openbts/drizzle";
import { unlinkSync } from "node:fs";
/* eslint-disable no-await-in-loop */
import path from "node:path";
import readline from "node:readline";
import url from "node:url";
import XLSX from "xlsx";

import { BATCH_SIZE, DOWNLOAD_DIR, PERMITS_DEVICES_URL, PERMIT_FILE_OPERATOR_MAP, REGION_BY_TERYT_PREFIX } from "./config.ts";
import { chunk, convertDMSToDD, createLogger, downloadFile, ensureDownloadDir } from "./utils.ts";

const logger = createLogger("device-registry");
import { db } from "@openbts/drizzle/db";
import { and, eq, inArray, lt } from "drizzle-orm/sql/expressions/conditions";

import { getLastImportedFileNames, recordImportMetadata } from "./import-check.ts";
import { scrapePermitDeviceLinks } from "./scrape.ts";
import { upsertBands, upsertRegions, upsertUkeLocations } from "./upserts.ts";
import { findVoivodeshipByTeryt } from "./voivodeship-lookup.ts";

const voivodeshipCache = new Map<string, string | null>();
function findVoivodeshipCached(lon: number, lat: number): string | null {
  const key = `${lon}:${lat}`;
  if (voivodeshipCache.has(key)) return voivodeshipCache.get(key)!;
  const result = findVoivodeshipByTeryt(lon, lat);
  voivodeshipCache.set(key, result);
  return result;
}

function getRegionByTeryt(teryt: string): { name: string; code: string } | null {
  return REGION_BY_TERYT_PREFIX[teryt] ?? null;
}

function parseBandFromSystemType(systemType: string | null): { rat: (typeof ratEnum.enumValues)[number]; value: number } | null {
  if (!systemType || typeof systemType !== "string") return null;
  const normalized = systemType.trim().toUpperCase();
  const m = normalized.match(/^(GSM|UMTS|LTE|5G|IOT)(\d{3,4})$/);
  if (!m) return null;
  const tech = m[1] ?? "";
  let value = Number(m[2] ?? "");
  if (!Number.isFinite(value)) return null;
  if (tech === "5G" && value === 3600) value = 3500;
  const rat =
    tech === "GSM"
      ? ("GSM" as const)
      : tech === "UMTS"
        ? ("UMTS" as const)
        : tech === "LTE"
          ? ("LTE" as const)
          : tech === "5G"
            ? ("NR" as const)
            : tech === "IOT"
              ? ("IOT" as const)
              : null;

  if (!rat) return null;
  return { rat, value };
}

function parseLongLat(val: string | null, direction: "N" | "E"): number | null {
  if (!val) return null;
  const str = val.trim();
  if (!str || str.length !== 6) return null;
  // 205840 -> 20°58'40" E -> "20E58'40''"
  const deg = str.slice(0, 2);
  const min = str.slice(2, 4);
  const sec = str.slice(4, 6);
  const dms = `${deg}${direction}${min}'${sec}''`;
  return convertDMSToDD(dms);
}

interface ColumnIndices {
  nrAlternatywny: number;
  rodzajWniosku: number;
  idStacji: number;
  nazwastacji?: number;
  miejscowosc: number;
  ulica: number;
  nrDomu: number;
  dodatkowyOpis: number;
  dlGeogr: number;
  szerGeogr: number;
  kodGUS: number;
  rodzajSystemuKomorki: number;
  azymut: number;
  elewacja: number;
  Hanteny: number;
  typKomorki: number;
}

function findColumnIndices(headerCells: string[]): ColumnIndices | null {
  const indices: Partial<ColumnIndices> = {};

  for (let i = 0; i < headerCells.length; i++) {
    const h = (headerCells[i] ?? "").trim().toLowerCase();
    switch (h) {
      case "nr alternatywny":
        if (indices.nrAlternatywny === undefined) indices.nrAlternatywny = i;
        break;
      case "rodzaj wniosku":
        indices.rodzajWniosku = i;
        break;
      case "id stacji":
        indices.idStacji = i;
        break;
      case "nazwa stacji":
        indices.nazwastacji = i;
        break;
      case "miejscowość":
      case "miejscowosc":
        indices.miejscowosc = i;
        break;
      case "ulica":
        indices.ulica = i;
        break;
      case "nr domu":
        indices.nrDomu = i;
        break;
      case "dodatkowy opis lokalizacji":
        indices.dodatkowyOpis = i;
        break;
      case "dł geogr.":
      case "dl geogr.":
      case "dł geogr":
      case "dl geogr":
        indices.dlGeogr = i;
        break;
      case "szer. geogr.":
      case "szer geogr.":
      case "szer. geogr":
      case "szer geogr":
        indices.szerGeogr = i;
        break;
      case "kod gus":
        indices.kodGUS = i;
        break;
      case "rodzaj systemu komórki":
      case "rodzaj systemu komorki":
        indices.rodzajSystemuKomorki = i;
        break;
      case "azymut":
        indices.azymut = i;
        break;
      case "elewacja":
        indices.elewacja = i;
        break;
      case "H anteny":
      case "h anteny":
        indices.Hanteny = i;
        break;
      case "typ komórki":
      case "typ komorki":
        indices.typKomorki = i;
        break;
    }
  }

  if (
    indices.nrAlternatywny === undefined ||
    indices.idStacji === undefined ||
    indices.dlGeogr === undefined ||
    indices.szerGeogr === undefined ||
    indices.rodzajSystemuKomorki === undefined
  ) {
    return null;
  }

  return indices as ColumnIndices;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++;
      } else if (char === '"') inQuotes = false;
      else current += char;
    } else {
      if (char === '"') inQuotes = true;
      else if (char === ",") {
        result.push(current);
        current = "";
      } else current += char;
    }
  }
  result.push(current);
  return result;
}

interface ParsedRow {
  stationId: string;
  mnoName: string | null;
  lon: number;
  lat: number;
  regionName: string;
  city: string | null;
  address: string | null;
  decisionNumber: string;
  decisionType: "P" | "zmP";
  bandKey: string;
  bandInfo: { rat: (typeof ratEnum.enumValues)[number]; value: number };
  azimuth: number | null;
  elevation: number | null;
  antennaType: "indoor" | "outdoor" | null;
  antennaHeight: number | null;
}

function buildBandKeysArray(
  fileBandKeys: Set<string>,
): Array<{ rat: (typeof ratEnum.enumValues)[number]; value: number; variant: "commercial" | "railway" }> {
  const result: Array<{ rat: (typeof ratEnum.enumValues)[number]; value: number; variant: "commercial" | "railway" }> = [];
  for (const key of fileBandKeys) {
    const [rat, valueStr, variant] = key.split(":");
    const value = Number(valueStr);
    if (rat && Number.isFinite(value) && variant)
      result.push({ rat: rat as (typeof ratEnum.enumValues)[number], value, variant: variant as "commercial" | "railway" });
  }
  return result;
}

async function processOperatorFile(
  filePath: string,
  operatorKey: string,
  operatorId: number,
  regionIds: Map<string, number>,
  fileDate: Date,
): Promise<{ rowCount: number; insertedCount: number }> {
  logger.log(`Reading file for ${operatorKey}`);

  const wb = XLSX.readFile(filePath, { dense: true });
  const sheetName = wb.SheetNames[1];
  if (!sheetName) {
    logger.warn(`No second sheet found in ${operatorKey}`);
    return { rowCount: 0, insertedCount: 0 };
  }

  const ws = wb.Sheets[sheetName];
  if (!ws) return { rowCount: 0, insertedCount: 0 };
  logger.log("Streaming data...");

  const csvStream = XLSX.stream.to_csv(ws);
  const rl = readline.createInterface({ input: csvStream, crlfDelay: Number.POSITIVE_INFINITY });

  let rowCount = 0;
  let insertedCount = 0;
  let cols: ColumnIndices | null = null;
  let chunkRows: ParsedRow[] = [];
  const fileBandKeys = new Set<string>();
  const stationMnoNames = new Map<string, string>();
  let bandMap = new Map<string, number>();
  let lastUpsertedBandKeyCount = 0;
  const CHUNK_SIZE = 1000;

  for await (const line of rl) {
    if (rowCount === 0) {
      const headerCells = parseCSVLine(line);
      cols = findColumnIndices(headerCells);
      if (!cols) {
        logger.error(`Could not find required columns in header row of ${operatorKey}`);
        return { rowCount: 0, insertedCount: 0 };
      }
      rowCount++;
      continue;
    }

    if (!cols) continue;

    rowCount++;
    const cells = parseCSVLine(line);
    if (cells.every((cell) => !cell || cell.trim() === "")) continue;

    const lon = parseLongLat(cells[cols.dlGeogr] ?? null, "E");
    const lat = parseLongLat(cells[cols.szerGeogr] ?? null, "N");
    if (!lon || !lat) {
      logger.warn(`Invalid coordinates in row ${rowCount} for operator ${operatorKey}`);
      continue;
    }

    const stationId = (cells[cols.idStacji] ?? "").trim();
    if (!stationId) {
      logger.warn(`Missing station ID in row ${rowCount} for operator ${operatorKey}`);
      continue;
    }

    const bandInfo = parseBandFromSystemType(cells[cols.rodzajSystemuKomorki] ?? null);
    if (!bandInfo) {
      logger.warn(`Could not parse band from system type "${cells[cols.rodzajSystemuKomorki] ?? ""}" for station ${stationId}`);
      continue;
    }

    const bandKey = `${bandInfo.rat}:${bandInfo.value}:commercial`;
    fileBandKeys.add(bandKey);

    const terytCode = findVoivodeshipCached(lon, lat);
    if (!terytCode) {
      logger.warn(`Could not determine region from GPS coordinates (${lon}, ${lat}) for station ${stationId}`);
      continue;
    }

    const regionInfo = getRegionByTeryt(terytCode);
    if (!regionInfo) {
      logger.warn(`Could not find region mapping for teryt code "${terytCode}" for station ${stationId}`);
      continue;
    }

    const regionName = regionInfo.name;

    const addressParts: string[] = [];
    const ulica = cells[cols.ulica];
    const nrDomu = cells[cols.nrDomu];
    const dodatkowyOpis = cells[cols.dodatkowyOpis];
    if (ulica) addressParts.push(ulica.trim());
    if (nrDomu) addressParts.push(nrDomu.trim());
    if (dodatkowyOpis) addressParts.push(dodatkowyOpis.trim());

    const rawAzimuth = cols.azymut !== undefined ? cells[cols.azymut] : null;
    const rawElevation = cols.elewacja !== undefined ? cells[cols.elewacja] : null;
    const azimuth = rawAzimuth ? Number(rawAzimuth) : null;
    const elevation = rawElevation ? Number(rawElevation) : null;
    const antennaHeight = cols.Hanteny !== undefined ? Number(cells[cols.Hanteny]) : null;

    const rawTypKomorki = cols.typKomorki !== undefined ? (cells[cols.typKomorki] ?? "").trim().toLowerCase() : null;
    const antennaType = rawTypKomorki === "w" ? ("indoor" as const) : rawTypKomorki === "z" ? ("outdoor" as const) : null;

    const rawNazwaStacji = cols.nazwastacji !== undefined ? (cells[cols.nazwastacji] ?? "").trim() : null;
    if (rawNazwaStacji && !stationMnoNames.has(stationId)) stationMnoNames.set(stationId, rawNazwaStacji);

    chunkRows.push({
      stationId,
      mnoName: rawNazwaStacji || null,
      lon,
      lat,
      regionName,
      city: cells[cols.miejscowosc]?.trim() ?? null,
      address: addressParts.length > 0 ? addressParts.join(" ") : null,
      decisionNumber: (cells[cols.nrAlternatywny] ?? "").trim(),
      decisionType: (cells[cols.rodzajWniosku] ?? "").trim().toUpperCase() === "M" ? "zmP" : "P",
      bandKey,
      bandInfo,
      azimuth: Number.isFinite(azimuth) ? azimuth : null,
      elevation: Number.isFinite(elevation) ? elevation : null,
      antennaHeight,
      antennaType,
    });

    if (chunkRows.length >= CHUNK_SIZE) {
      if (fileBandKeys.size > lastUpsertedBandKeyCount) {
        bandMap = await upsertBands(buildBandKeysArray(fileBandKeys));
        lastUpsertedBandKeyCount = fileBandKeys.size;
      }
      const inserted = await processChunk(chunkRows, operatorId, regionIds, bandMap, fileDate);
      insertedCount += inserted;
      chunkRows = [];
    }
  }

  if (chunkRows.length > 0) {
    if (fileBandKeys.size > lastUpsertedBandKeyCount) {
      bandMap = await upsertBands(buildBandKeysArray(fileBandKeys));
    }
    const inserted = await processChunk(chunkRows, operatorId, regionIds, bandMap, fileDate);
    insertedCount += inserted;
  }

  if (stationMnoNames.size > 0) {
    logger.log(`Syncing ${stationMnoNames.size} mno_name entries to extra_identificators...`);
    const stationIdStrings = Array.from(stationMnoNames.keys());
    const matchingStations = await db
      .select({ id: stations.id, station_id: stations.station_id })
      .from(stations)
      .where(and(inArray(stations.station_id, stationIdStrings), eq(stations.operator_id, operatorId)));

    const toInsert = matchingStations
      .map((s) => ({ station_id: s.id, mno_name: stationMnoNames.get(s.station_id) ?? null }))
      .filter((v): v is { station_id: number; mno_name: string } => v.mno_name !== null);

    if (toInsert.length > 0) {
      const internalStationIds = toInsert.map((v) => v.station_id);
      const existing = await db
        .select({ id: extraIdentificators.id, station_id: extraIdentificators.station_id, mno_name: extraIdentificators.mno_name })
        .from(extraIdentificators)
        .where(inArray(extraIdentificators.station_id, internalStationIds));

      const existingByStationId = new Map(existing.map((e) => [e.station_id, e]));

      const toInsertNew: typeof toInsert = [];
      const updatePromises: Promise<unknown>[] = [];
      for (const v of toInsert) {
        const existingRow = existingByStationId.get(v.station_id);
        if (!existingRow) {
          toInsertNew.push(v);
        } else if (existingRow.mno_name !== v.mno_name) {
          updatePromises.push(
            db.update(extraIdentificators).set({ mno_name: v.mno_name, updatedAt: new Date() }).where(eq(extraIdentificators.id, existingRow.id)),
          );
        }
      }
      if (updatePromises.length) await Promise.all(updatePromises);

      for (const group of chunk(toInsertNew, BATCH_SIZE)) {
        await db.insert(extraIdentificators).values(group);
      }
      logger.log(`Synced mno_name: ${toInsertNew.length} inserted, ${toInsert.length - toInsertNew.length} already existed`);
    }
  }

  logger.log(`Done: ${rowCount - 1} data rows, ${insertedCount} permits inserted`);
  return { rowCount: rowCount - 1, insertedCount };
}

async function processChunk(
  rows: ParsedRow[],
  operatorId: number,
  regionIds: Map<string, number>,
  bandMap: Map<string, number>,
  fileDate: Date,
): Promise<number> {
  const locationItems = rows.map((r) => ({
    regionName: r.regionName,
    city: r.city,
    address: r.address,
    lon: r.lon,
    lat: r.lat,
  }));
  const locationIdByLonLat = await upsertUkeLocations(locationItems, regionIds);

  const values = rows
    .map((r) => {
      const locationKey = `${r.lon}:${r.lat}`;
      const location_id = locationIdByLonLat.get(locationKey);
      if (!location_id) {
        logger.log("Missing location_id for key:", locationKey);
        return null;
      }

      const bandId = bandMap.get(r.bandKey);
      if (!bandId) {
        logger.log("Missing bandId for key:", r.bandKey);
        return null;
      }

      return {
        permit: {
          station_id: r.stationId,
          operator_id: operatorId,
          location_id,
          decision_number: r.decisionNumber,
          decision_type: r.decisionType,
          expiry_date: new Date("2099-12-31T23:59:59Z"),
          band_id: bandId,
          source: "device_registry" as const,
          createdAt: fileDate,
          updatedAt: fileDate,
        },
        sector: {
          azimuth: r.azimuth,
          elevation: r.elevation,
          antenna_height: r.antennaHeight,
          antenna_type: r.antennaType,
        },
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null && v !== undefined);

  const deduplicatedPermitsMap = new Map<string, (typeof values)[number]["permit"]>();
  const sectorsByPermitKey = new Map<string, Array<(typeof values)[number]["sector"]>>();
  for (const row of values) {
    const uniqueKey = `${row.permit.station_id}|${row.permit.operator_id}|${row.permit.location_id}|${row.permit.band_id}|${row.permit.decision_number}|${row.permit.decision_type}|${row.permit.expiry_date.toISOString()}`;
    deduplicatedPermitsMap.set(uniqueKey, row.permit);
    const sectors = sectorsByPermitKey.get(uniqueKey) ?? [];
    sectors.push(row.sector);
    sectorsByPermitKey.set(uniqueKey, sectors);
  }

  const uniquePermits = Array.from(deduplicatedPermitsMap.entries());

  let insertedCount = 0;
  for (const group of chunk(uniquePermits, BATCH_SIZE)) {
    if (group.length) {
      const permitRows = group.map(([, permit]) => permit);
      const inserted = await db
        .insert(ukePermits)
        .values(permitRows)
        .onConflictDoUpdate({
          target: [
            ukePermits.station_id,
            ukePermits.operator_id,
            ukePermits.location_id,
            ukePermits.band_id,
            ukePermits.decision_number,
            ukePermits.decision_type,
            ukePermits.expiry_date,
          ],
          set: { updatedAt: fileDate, source: "device_registry" },
        })
        .returning({
          id: ukePermits.id,
          station_id: ukePermits.station_id,
          operator_id: ukePermits.operator_id,
          location_id: ukePermits.location_id,
          band_id: ukePermits.band_id,
          decision_number: ukePermits.decision_number,
          decision_type: ukePermits.decision_type,
          expiry_date: ukePermits.expiry_date,
        });

      const sectorValues: Array<{ permit_id: number; azimuth: number | null; elevation: number | null; antenna_type: "indoor" | "outdoor" | null }> =
        [];
      for (const permit of inserted) {
        const key = `${permit.station_id}|${permit.operator_id}|${permit.location_id}|${permit.band_id}|${permit.decision_number}|${permit.decision_type}|${permit.expiry_date.toISOString()}`;
        const sectors = sectorsByPermitKey.get(key) ?? [];
        for (const sector of sectors) {
          sectorValues.push({ permit_id: permit.id, ...sector });
        }
      }

      if (sectorValues.length) {
        for (const sectorGroup of chunk(sectorValues, BATCH_SIZE)) {
          await db.insert(ukePermitSectors).values(sectorGroup).onConflictDoNothing();
        }
      }

      insertedCount += group.length;
    }
  }

  return insertedCount;
}

export async function importDeviceRegistry(): Promise<boolean> {
  logger.log("Starting import from device registry...");
  logger.log("Scraping file links from:", PERMITS_DEVICES_URL);
  const links = await scrapePermitDeviceLinks(PERMITS_DEVICES_URL);
  logger.log(`Found ${links.length} files:`, links.map((l) => l.operatorKey).join(", "));

  const linksForCheck = links.map((l) => ({ href: l.href, text: l.text }));
  const previousFileNames = await getLastImportedFileNames("device_registry");
  const newLinks = previousFileNames ? links.filter((l) => !previousFileNames.has(l.href.split("/").pop() ?? l.href)) : links;

  if (newLinks.length === 0) {
    if (previousFileNames && previousFileNames.size !== links.length) {
      logger.log("No new files to process, updating metadata");
      await recordImportMetadata("device_registry", linksForCheck, "success");
    } else {
      logger.log("Data is up-to-date, skipping import");
    }
    return false;
  }

  logger.log(`Processing ${newLinks.length} new file(s) (skipping ${links.length - newLinks.length} already imported)`);

  ensureDownloadDir();

  logger.log("Looking up operators...");
  const operatorNamesNeeded = newLinks.map((l) => PERMIT_FILE_OPERATOR_MAP[l.operatorKey]).filter((n): n is string => n !== null && n !== undefined);

  const operatorIds = new Map<string, number>();
  if (operatorNamesNeeded.length > 0) {
    const existingOperators = await db.query.operators.findMany({
      where: {
        name: {
          in: operatorNamesNeeded,
        },
      },
    });
    for (const op of existingOperators) {
      operatorIds.set(op.name, op.id);
    }
    logger.log(`Found ${operatorIds.size}/${operatorNamesNeeded.length} operators in database`);
  }

  logger.log("Upserting regions...");
  const regionItems = Object.values(REGION_BY_TERYT_PREFIX);
  const regionIds = await upsertRegions(regionItems);

  logger.log("Downloading all files...");
  const downloadedFiles = (
    await Promise.all(
      newLinks.map(async (l) => {
        const operatorName = PERMIT_FILE_OPERATOR_MAP[l.operatorKey];
        if (!operatorName) {
          logger.warn(`Unknown operator key: ${l.operatorKey}`);
          return null;
        }
        const operatorId = operatorIds.get(operatorName);
        if (!operatorId) {
          logger.warn(`Operator not found in database: ${operatorName}`);
          return null;
        }
        const fileName = `${(l.text || path.basename(new url.URL(l.href).pathname)).replace(/\s+/g, "_").replace("_plik_XLSX", "")}.xlsx`;
        const filePath = path.join(DOWNLOAD_DIR, fileName);
        const fileDateStr = l.href
          .split("/")
          .pop()
          ?.match(/(\d{4}-\d{2}-\d{2})/)?.[1];
        const fileDate = fileDateStr ? new Date(fileDateStr) : new Date();
        logger.log(`Downloading: ${fileName}`);
        await downloadFile(l.href, filePath);
        return { filePath, operatorKey: l.operatorKey, operatorId, fileDate };
      }),
    )
  ).filter((f): f is NonNullable<typeof f> => f !== null);

  logger.log(`Downloaded ${downloadedFiles.length} files`);

  let totalRows = 0;
  let totalInserted = 0;

  for (const { filePath, operatorKey, operatorId, fileDate } of downloadedFiles) {
    try {
      const result = await processOperatorFile(filePath, operatorKey, operatorId, regionIds, fileDate);
      totalRows += result.rowCount;
      totalInserted += result.insertedCount;
    } finally {
      try {
        unlinkSync(filePath);
        logger.log(`Deleted: ${path.basename(filePath)}`);
      } catch {}
    }
  }

  logger.log(`Total: ${totalRows} rows processed, ${totalInserted} records inserted`);
  const importMetadataId = await recordImportMetadata("device_registry", linksForCheck, "success");

  logger.log("Deleting stale device registry permits...");
  let staleCount = 0;
  for (const { operatorId, fileDate } of downloadedFiles) {
    const stale = await db
      .select()
      .from(ukePermits)
      .where(and(eq(ukePermits.source, "device_registry"), eq(ukePermits.operator_id, operatorId), lt(ukePermits.updatedAt, fileDate)));

    if (stale.length > 0) {
      for (const group of chunk(stale, BATCH_SIZE)) {
        await db.insert(deletedEntries).values(
          group.map((row) => ({
            source_table: "uke_permits",
            source_id: row.id,
            source_type: "device_registry",
            data: row,
            import_id: importMetadataId,
          })),
        );
      }
      await db
        .delete(ukePermits)
        .where(and(eq(ukePermits.source, "device_registry"), eq(ukePermits.operator_id, operatorId), lt(ukePermits.updatedAt, fileDate)));
      staleCount += stale.length;
    }
  }
  logger.log(`Deleted ${staleCount} stale device registry permits`);

  logger.log("Import completed successfully");
  return true;
}
