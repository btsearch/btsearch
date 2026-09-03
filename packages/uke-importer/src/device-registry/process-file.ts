import readline from "node:readline";
import XLSX from "xlsx";

import { parseCsvLine } from "../csv.js";
import { upsertBands } from "../upserts.js";
import { createLogger } from "../utils.js";
import { syncStationMnoNames } from "./mno-names.js";
import {
  type ParsedDeviceRegistryRow,
  buildBandKeysArray,
  findColumnIndices,
  getOptionalCell,
  parseAntennaType,
  parseBandFromSystemType,
  parseLongLat,
} from "./parser.js";
import { persistDeviceRegistryRows } from "./persistence.js";
import { findVoivodeshipCached, getRegionByTeryt } from "./regions.js";

const logger = createLogger("device-registry");
const CHUNK_SIZE = 1000;

async function mergeNewBandIds(pendingBandKeys: Set<string>, bandMap: Map<string, number>): Promise<void> {
  if (pendingBandKeys.size === 0) return;

  const newBandIds = await upsertBands(buildBandKeysArray(pendingBandKeys));
  for (const [bandKey, bandId] of newBandIds) bandMap.set(bandKey, bandId);
  pendingBandKeys.clear();
}

export async function processOperatorFile(
  filePath: string,
  operatorKey: string,
  operatorId: number,
  regionIds: Map<string, number>,
  fileDate: Date,
): Promise<{ rowCount: number; insertedCount: number }> {
  logger.log(`Reading file for ${operatorKey}`);

  const workbook = XLSX.readFile(filePath, { dense: true });
  const sheetName = workbook.SheetNames[1];
  if (!sheetName) {
    logger.warn(`No second sheet found in ${operatorKey}`);
    return { rowCount: 0, insertedCount: 0 };
  }

  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) return { rowCount: 0, insertedCount: 0 };
  logger.log("Streaming data...");

  const csvStream = XLSX.stream.to_csv(worksheet);
  const lines = readline.createInterface({ input: csvStream, crlfDelay: Number.POSITIVE_INFINITY });

  let rowCount = 0;
  let insertedCount = 0;
  let columns: ReturnType<typeof findColumnIndices> = null;
  let chunkRows: ParsedDeviceRegistryRow[] = [];
  const fileBandKeys = new Set<string>();
  const pendingBandKeys = new Set<string>();
  const stationMnoNames = new Map<string, string>();
  const bandMap = new Map<string, number>();

  for await (const line of lines) {
    if (rowCount === 0) {
      const headerCells = parseCsvLine(line);
      columns = findColumnIndices(headerCells);
      if (!columns) {
        logger.error(`Could not find required columns in header row of ${operatorKey}`);
        return { rowCount: 0, insertedCount: 0 };
      }
      rowCount++;
      continue;
    }

    if (!columns) continue;

    rowCount++;
    const cells = parseCsvLine(line);
    if (cells.every((cell) => !cell || cell.trim() === "")) continue;

    const lon = parseLongLat(cells[columns.longitude] ?? null, "E");
    const lat = parseLongLat(cells[columns.latitude] ?? null, "N");
    if (!lon || !lat) {
      logger.warn(`Invalid coordinates in row ${rowCount} for operator ${operatorKey}`);
      continue;
    }

    const stationId = (cells[columns.stationId] ?? "").trim();
    if (!stationId) {
      logger.warn(`Missing station ID in row ${rowCount} for operator ${operatorKey}`);
      continue;
    }

    const bandInfo = parseBandFromSystemType(cells[columns.systemType] ?? null);
    if (!bandInfo) {
      logger.warn(`Could not parse band from system type "${cells[columns.systemType] ?? ""}" for station ${stationId}`);
      continue;
    }

    const bandKey = `${bandInfo.rat}:${bandInfo.value}:commercial`;
    if (!fileBandKeys.has(bandKey)) {
      fileBandKeys.add(bandKey);
      pendingBandKeys.add(bandKey);
    }

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

    const addressParts: string[] = [];
    const street = getOptionalCell(cells, columns.street);
    const houseNumber = getOptionalCell(cells, columns.houseNumber);
    const locationDescription = getOptionalCell(cells, columns.locationDescription);
    if (street) addressParts.push(street.trim());
    if (houseNumber) addressParts.push(houseNumber.trim());
    if (locationDescription) addressParts.push(locationDescription.trim());

    const rawAzimuth = columns.azimuth !== undefined ? cells[columns.azimuth] : null;
    const rawElevation = columns.elevation !== undefined ? cells[columns.elevation] : null;
    const azimuth = rawAzimuth ? Number(rawAzimuth) : null;
    const elevation = rawElevation ? Number(rawElevation) : null;
    const antennaHeight = columns.antennaHeight !== undefined ? Number(cells[columns.antennaHeight]) : null;

    const rawCellType = columns.cellType !== undefined ? (cells[columns.cellType] ?? "").trim().toLowerCase() : null;
    const antennaType = parseAntennaType(rawCellType);

    const rawStationName = columns.stationName !== undefined ? (cells[columns.stationName] ?? "").trim() : null;
    if (rawStationName && !stationMnoNames.has(stationId)) stationMnoNames.set(stationId, rawStationName);

    chunkRows.push({
      stationId,
      lon,
      lat,
      regionName: regionInfo.name,
      city: getOptionalCell(cells, columns.city)?.trim() ?? null,
      address: addressParts.length > 0 ? addressParts.join(" ") : null,
      decisionNumber: (cells[columns.alternativeNumber] ?? "").trim(),
      decisionType: (getOptionalCell(cells, columns.applicationType) ?? "").trim().toUpperCase() === "M" ? "zmP" : "P",
      bandKey,
      azimuth: Number.isFinite(azimuth) ? azimuth : null,
      elevation: Number.isFinite(elevation) ? elevation : null,
      antennaHeight,
      antennaType,
    });

    if (chunkRows.length >= CHUNK_SIZE) {
      await mergeNewBandIds(pendingBandKeys, bandMap);
      const inserted = await persistDeviceRegistryRows(chunkRows, operatorId, regionIds, bandMap, fileDate);
      insertedCount += inserted;
      chunkRows = [];
    }
  }

  if (chunkRows.length > 0) {
    await mergeNewBandIds(pendingBandKeys, bandMap);
    const inserted = await persistDeviceRegistryRows(chunkRows, operatorId, regionIds, bandMap, fileDate);
    insertedCount += inserted;
  }

  if (stationMnoNames.size > 0) await syncStationMnoNames(stationMnoNames, operatorId);

  logger.log(`Done: ${rowCount - 1} data rows, ${insertedCount} permits inserted`);
  return { rowCount: rowCount - 1, insertedCount };
}
