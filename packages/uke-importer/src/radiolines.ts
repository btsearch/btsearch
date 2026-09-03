import path from "node:path";
import url from "node:url";

import { DOWNLOAD_DIR, RADIOLINES_URL } from "./config.js";
import { getLastImportedFileNames, recordImportMetadata } from "./import-check.js";
import {
  collectRadiolineEquipmentNames,
  upsertRadiolineAntennaTypes,
  upsertRadiolineManufacturers,
  upsertRadiolineTransmitterTypes,
} from "./radiolines/equipment.js";
import { archiveAndDeleteRadiolines, insertRadiolines, loadRadiolineChanges, updateRadiolines } from "./radiolines/persistence.js";
import { collectRadiolineOperatorNames, prepareRadiolineRecords } from "./radiolines/records.js";
import { scrapeXlsxLinks } from "./scrape.js";
import type { RawRadioLineData } from "./types.js";
import { upsertUkeOperators } from "./upserts.js";
import { downloadFile, ensureDownloadDir, parseFileDateWithImportTime, readSheetAsJson } from "./utils.js";

export async function importRadiolines(): Promise<boolean> {
  console.log("[radiolines] Starting radiolines import...");
  console.log("[radiolines] Scraping file links from:", RADIOLINES_URL);
  const links = await scrapeXlsxLinks(RADIOLINES_URL);
  if (!links[0]) {
    console.log("[radiolines] No files found");
    return false;
  }
  console.log(`[radiolines] Found ${links.length} file(s)`);

  const previousFileNames = await getLastImportedFileNames("radiolines");
  const newLinks = previousFileNames ? links.filter((link) => !previousFileNames.has(link.href.split("/").pop() ?? link.href)) : links;

  if (newLinks.length === 0) {
    if (previousFileNames && previousFileNames.size !== links.length) {
      console.log("[radiolines] No new files to process, updating metadata");
      await recordImportMetadata("radiolines", links, "success");
    } else {
      console.log("[radiolines] Data is up-to-date, skipping import");
    }
    return false;
  }

  console.log(`[radiolines] Processing ${newLinks.length} new file(s) (skipping ${links.length - newLinks.length} already imported)`);

  ensureDownloadDir();
  const [first] = newLinks;
  if (!first) return false;
  const fileName = `${(first.text || path.basename(new url.URL(first.href).pathname)).replace(/\s+/g, "_").replace("_plik_XLSX", "")}.xlsx`;
  const filePath = path.join(DOWNLOAD_DIR, fileName);
  console.log(`[radiolines] Downloading: ${fileName}`);
  await downloadFile(first.href, filePath);
  const rows = readSheetAsJson<RawRadioLineData>(filePath);
  console.log(`[radiolines] Loaded ${rows.length} rows`);

  console.log("[radiolines] Collecting manufacturers, antenna types, transmitter types...");
  const equipmentNames = collectRadiolineEquipmentNames(rows);
  console.log(
    `[radiolines] Found ${equipmentNames.manufacturerNames.size} manufacturers, ${equipmentNames.antennaTypeTuples.size} antenna types, ${equipmentNames.transmitterTypeTuples.size} transmitter types`,
  );

  const importTime = new Date();
  const fileDate = parseFileDateWithImportTime(first.href, importTime);

  console.log("[radiolines] Upserting manufacturers...");
  const manufacturerIdByName = await upsertRadiolineManufacturers(equipmentNames.manufacturerNames);

  console.log("[radiolines] Upserting antenna types...");
  const antennaTypeIdByName = await upsertRadiolineAntennaTypes(equipmentNames.antennaTypeTuples, manufacturerIdByName);

  console.log("[radiolines] Upserting transmitter types...");
  const transmitterTypeIdByName = await upsertRadiolineTransmitterTypes(equipmentNames.transmitterTypeTuples, manufacturerIdByName);

  console.log("[radiolines] Upserting operators...");
  const operatorNames = collectRadiolineOperatorNames(rows);
  console.log(`[radiolines] Found ${operatorNames.length} unique operators`);
  const operatorIdByName = await upsertUkeOperators(operatorNames);

  console.log("[radiolines] Preparing radioline records...");
  const values = prepareRadiolineRecords(rows, { antennaTypeIdByName, transmitterTypeIdByName }, operatorIdByName, fileDate);

  console.log("[radiolines] Loading existing radiolines...");
  const { toInsert, toUpdate, staleRadiolines } = await loadRadiolineChanges(values);

  console.log(`[radiolines] Inserting ${toInsert.length} new radiolines...`);
  await insertRadiolines(toInsert);

  console.log(`[radiolines] Updating ${toUpdate.length} changed radiolines...`);
  await updateRadiolines(toUpdate);

  const importMetadataId = await recordImportMetadata("radiolines", links, "success");

  console.log("[radiolines] Archiving and deleting stale radiolines...");
  await archiveAndDeleteRadiolines(staleRadiolines, importMetadataId);

  console.log(`[radiolines] Deleted ${staleRadiolines.length} stale radiolines`);

  console.log("[radiolines] Import completed successfully");
  return true;
}
