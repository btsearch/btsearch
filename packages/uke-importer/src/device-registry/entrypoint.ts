import { deletedEntries, ukePermits, ukeStations } from "@openbts/drizzle";
import { and, eq, inArray, lt } from "drizzle-orm/sql/expressions/conditions";
/* eslint-disable no-await-in-loop */
import { unlinkSync } from "node:fs";
import path from "node:path";
import url from "node:url";

import { BATCH_SIZE, DOWNLOAD_DIR, PERMITS_DEVICES_URL, PERMIT_FILE_OPERATOR_MAP, REGION_BY_TERYT_PREFIX } from "../config.js";
import { db } from "../database.js";
import { getLastImportedFileNames, recordImportMetadata } from "../import-check.js";
import { scrapePermitDeviceLinks } from "../scrape.js";
import { loadInternalStationIdByPermit, refreshUkeStationActivity } from "../uke-stations.js";
import { upsertRegions } from "../upserts.js";
import { chunk, createLogger, downloadFile, ensureDownloadDir, parseFileDateWithImportTime } from "../utils.js";
import { processOperatorFile } from "./process-file.js";

const logger = createLogger("device-registry");

export async function importDeviceRegistry(): Promise<boolean> {
  logger.log("Starting import from device registry...");
  logger.log("Scraping file links from:", PERMITS_DEVICES_URL);
  const links = await scrapePermitDeviceLinks(PERMITS_DEVICES_URL);
  logger.log(`Found ${links.length} files:`, links.map((link) => link.operatorKey).join(", "));

  const linksForCheck = links.map((link) => ({ href: link.href, text: link.text }));
  const previousFileNames = await getLastImportedFileNames("device_registry");
  const newLinks = previousFileNames ? links.filter((link) => !previousFileNames.has(link.href.split("/").pop() ?? link.href)) : links;

  if (newLinks.length === 0) {
    if (previousFileNames && previousFileNames.size !== links.length) {
      logger.log("No new files to process, updating metadata");
      await recordImportMetadata("device_registry", linksForCheck, "success");
    } else logger.log("Data is up-to-date, skipping import");
    return false;
  }

  logger.log(`Processing ${newLinks.length} new file(s) (skipping ${links.length - newLinks.length} already imported)`);
  ensureDownloadDir();

  logger.log("Looking up operators...");
  const operatorNamesNeeded = newLinks
    .map((link) => PERMIT_FILE_OPERATOR_MAP[link.operatorKey])
    .filter((name): name is string => name !== null && name !== undefined);

  const operatorIds = new Map<string, number>();
  if (operatorNamesNeeded.length > 0) {
    const existingOperators = await db.query.operators.findMany({
      where: {
        name: {
          in: operatorNamesNeeded,
        },
      },
    });
    for (const operator of existingOperators) operatorIds.set(operator.name, operator.id);
    logger.log(`Found ${operatorIds.size}/${operatorNamesNeeded.length} operators in database`);
  }

  logger.log("Upserting regions...");
  const regionItems = Object.values(REGION_BY_TERYT_PREFIX);
  const regionIds = await upsertRegions(regionItems);

  logger.log("Downloading all files...");
  const importTime = new Date();
  const downloadedFiles = (
    await Promise.all(
      newLinks.map(async (link) => {
        const operatorName = PERMIT_FILE_OPERATOR_MAP[link.operatorKey];
        if (!operatorName) {
          logger.warn(`Unknown operator key: ${link.operatorKey}`);
          return null;
        }
        const operatorId = operatorIds.get(operatorName);
        if (!operatorId) {
          logger.warn(`Operator not found in database: ${operatorName}`);
          return null;
        }
        const fileName = `${(link.text || path.basename(new url.URL(link.href).pathname)).replace(/\s+/g, "_").replace("_plik_XLSX", "")}.xlsx`;
        const filePath = path.join(DOWNLOAD_DIR, fileName);
        const fileDate = parseFileDateWithImportTime(link.href, importTime);
        logger.log(`Downloading: ${fileName}`);
        await downloadFile(link.href, filePath);
        return { filePath, operatorKey: link.operatorKey, operatorId, fileDate };
      }),
    )
  ).filter((file): file is NonNullable<typeof file> => file !== null);

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
    const staleRows = await db
      .select({ permit: ukePermits })
      .from(ukePermits)
      .innerJoin(ukeStations, eq(ukePermits.uke_station_id, ukeStations.id))
      .where(and(eq(ukePermits.source, "device_registry"), eq(ukeStations.operator_id, operatorId), lt(ukePermits.updatedAt, fileDate)));
    const stale = staleRows.map((row) => row.permit);

    if (stale.length > 0) {
      const affectedStationIds = stale.map((row) => row.uke_station_id);
      const internalStationIdByPermit = await loadInternalStationIdByPermit(stale.map((row) => row.id));
      for (const group of chunk(stale, BATCH_SIZE)) {
        await db.insert(deletedEntries).values(
          group.map((row) => ({
            source_table: "uke_permits",
            source_id: row.id,
            source_type: "device_registry",
            data: { ...row, internal_station_id: internalStationIdByPermit.get(row.id) ?? null },
            import_id: importMetadataId,
          })),
        );
      }
      await db.delete(ukePermits).where(
        inArray(
          ukePermits.id,
          stale.map((row) => row.id),
        ),
      );
      await refreshUkeStationActivity(affectedStationIds);
      staleCount += stale.length;
    }
  }
  logger.log(`Deleted ${staleCount} stale device registry permits`);

  logger.log("Import completed successfully");
  return true;
}
