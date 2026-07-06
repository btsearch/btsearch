import { deletedEntries, radioLinesManufacturers, radiolinesAntennaTypes, radiolinesTransmitterTypes, ukeRadiolines } from "@openbts/drizzle";
import { db } from "@openbts/drizzle/db";
import { eq, inArray } from "drizzle-orm";
/* eslint-disable no-await-in-loop */
import path from "node:path";
import url from "node:url";

import { BATCH_SIZE, DOWNLOAD_DIR, RADIOLINES_URL } from "./config.js";
import { getLastImportedFileNames, recordImportMetadata } from "./import-check.js";
import { scrapeXlsxLinks } from "./scrape.js";
import type { RawRadioLineData } from "./types.js";
import { upsertUkeOperators } from "./upserts.js";
import {
  chunk,
  convertDMSToDD,
  downloadFile,
  ensureDownloadDir,
  parseExcelDate,
  parseFileDateWithImportTime,
  readSheetAsJson,
  stripCompanySuffixForName,
} from "./utils.js";

type UkeRadiolineInsert = typeof ukeRadiolines.$inferInsert;
type UkeRadiolineSelect = typeof ukeRadiolines.$inferSelect;

const radiolineComparisonFields = [
  "tx_longitude",
  "tx_latitude",
  "tx_height",
  "tx_city",
  "tx_province",
  "tx_street",
  "tx_location_description",
  "rx_longitude",
  "rx_latitude",
  "rx_height",
  "rx_city",
  "rx_province",
  "rx_street",
  "rx_location_description",
  "freq",
  "ch_num",
  "plan_symbol",
  "ch_width",
  "polarization",
  "modulation_type",
  "bandwidth",
  "tx_eirp",
  "tx_antenna_attenuation",
  "tx_transmitter_type_id",
  "tx_antenna_type_id",
  "tx_antenna_gain",
  "tx_antenna_height",
  "rx_antenna_type_id",
  "rx_antenna_gain",
  "rx_antenna_height",
  "rx_noise_figure",
  "rx_atpc_attenuation",
  "operator_id",
  "physical_key",
  "permit_number",
  "decision_type",
  "issue_date",
  "expiry_date",
] as const satisfies readonly (keyof UkeRadiolineInsert & keyof UkeRadiolineSelect)[];

function isNonEmptyName<T extends { name: string | undefined }>(v: T): v is T & { name: string } {
  return typeof v.name === "string" && v.name.length > 0;
}

function identityPart(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function buildPhysicalKey(
  value: Pick<
    UkeRadiolineInsert,
    "operator_id" | "tx_longitude" | "tx_latitude" | "rx_longitude" | "rx_latitude" | "freq" | "polarization" | "ch_num"
  >,
): string {
  return [
    value.operator_id,
    value.tx_longitude,
    value.tx_latitude,
    value.rx_longitude,
    value.rx_latitude,
    value.freq,
    value.polarization,
    value.ch_num,
  ]
    .map(identityPart)
    .join("|");
}

function buildAuthorizationKey(value: Pick<UkeRadiolineInsert, "permit_number" | "physical_key">): string {
  return `${value.permit_number}|${value.physical_key}`;
}

function compareValue(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  if (value === undefined) return null;
  return value;
}

function hasRadiolineChanges(existing: UkeRadiolineSelect, next: UkeRadiolineInsert): boolean {
  return radiolineComparisonFields.some((field) => compareValue(existing[field]) !== compareValue(next[field]));
}

function toRadiolineUpdate(value: UkeRadiolineInsert): Partial<UkeRadiolineInsert> {
  return {
    tx_longitude: value.tx_longitude,
    tx_latitude: value.tx_latitude,
    tx_height: value.tx_height,
    tx_city: value.tx_city,
    tx_province: value.tx_province,
    tx_street: value.tx_street,
    tx_location_description: value.tx_location_description,
    rx_longitude: value.rx_longitude,
    rx_latitude: value.rx_latitude,
    rx_height: value.rx_height,
    rx_city: value.rx_city,
    rx_province: value.rx_province,
    rx_street: value.rx_street,
    rx_location_description: value.rx_location_description,
    freq: value.freq,
    ch_num: value.ch_num,
    plan_symbol: value.plan_symbol,
    ch_width: value.ch_width,
    polarization: value.polarization,
    modulation_type: value.modulation_type,
    bandwidth: value.bandwidth,
    tx_eirp: value.tx_eirp,
    tx_antenna_attenuation: value.tx_antenna_attenuation,
    tx_transmitter_type_id: value.tx_transmitter_type_id,
    tx_antenna_type_id: value.tx_antenna_type_id,
    tx_antenna_gain: value.tx_antenna_gain,
    tx_antenna_height: value.tx_antenna_height,
    rx_antenna_type_id: value.rx_antenna_type_id,
    rx_antenna_gain: value.rx_antenna_gain,
    rx_antenna_height: value.rx_antenna_height,
    rx_noise_figure: value.rx_noise_figure,
    rx_atpc_attenuation: value.rx_atpc_attenuation,
    operator_id: value.operator_id,
    physical_key: value.physical_key,
    permit_number: value.permit_number,
    decision_type: value.decision_type,
    issue_date: value.issue_date,
    expiry_date: value.expiry_date,
    updatedAt: value.updatedAt,
  };
}

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
  const newLinks = previousFileNames ? links.filter((l) => !previousFileNames.has(l.href.split("/").pop() ?? l.href)) : links;

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
  const manufNames = new Set<string>();
  const antTypeTuples = new Set<string>();
  const txTypeTuples = new Set<string>();
  for (const r of rows) {
    if (r.Prod_ant_Tx) manufNames.add(String(r.Prod_ant_Tx).trim());
    if (r.Prod_ant_Rx) manufNames.add(String(r.Prod_ant_Rx).trim());
    if (r.Prod_nad) manufNames.add(String(r.Prod_nad).trim());
    if (r.Typ_ant_Tx) antTypeTuples.add(`${String(r.Typ_ant_Tx).trim()}|${String(r.Prod_ant_Tx || "").trim()}`);
    if (r.Typ_ant_Rx) antTypeTuples.add(`${String(r.Typ_ant_Rx).trim()}|${String(r.Prod_ant_Rx || "").trim()}`);
    if (r.Typ_nad) txTypeTuples.add(`${String(r.Typ_nad).trim()}|${String(r.Prod_nad || "").trim()}`);
  }
  console.log(`[radiolines] Found ${manufNames.size} manufacturers, ${antTypeTuples.size} antenna types, ${txTypeTuples.size} transmitter types`);

  const importTime = new Date();
  const fileDate = parseFileDateWithImportTime(first.href, importTime);

  console.log("[radiolines] Upserting manufacturers...");
  const manufArr = Array.from(manufNames).filter((s) => s.length > 0);
  const manufIdByName = new Map<string, number>();
  if (manufArr.length) {
    const existingManuf = await db.query.radioLinesManufacturers.findMany({
      where: { name: { in: manufArr } },
    });
    for (const m of existingManuf) manufIdByName.set(m.name, m.id);

    const toInsertManuf = manufArr.filter((n) => !manufIdByName.has(n));
    if (toInsertManuf.length) {
      for (const group of chunk(toInsertManuf, BATCH_SIZE)) {
        await db.insert(radioLinesManufacturers).values(group.map((n) => ({ name: n })));
      }
      const newManuf = await db.query.radioLinesManufacturers.findMany({
        where: { name: { in: toInsertManuf } },
      });
      for (const m of newManuf) manufIdByName.set(m.name, m.id);
    }
  }

  console.log("[radiolines] Upserting antenna types...");
  const antTypesRaw = Array.from(antTypeTuples).map((s) => {
    const [name, man] = s.split("|");
    return { name, manufacturer_id: man ? (manufIdByName.get(man) ?? null) : null } as { name: string | undefined; manufacturer_id: number | null };
  });
  const antTypesDeduped = new Map<string, (typeof antTypesRaw)[number] & { name: string }>();
  for (const a of antTypesRaw.filter(isNonEmptyName)) {
    if (!antTypesDeduped.has(a.name)) antTypesDeduped.set(a.name, a);
  }
  const antTypes = Array.from(antTypesDeduped.values());
  const antIdByName = new Map<string, number>();
  if (antTypes.length) {
    const existingAnt = await db.query.radiolinesAntennaTypes.findMany({
      where: { name: { in: antTypes.map((a) => a.name) } },
    });
    for (const a of existingAnt) antIdByName.set(a.name, a.id);

    const toInsertAnt = antTypes.filter((a) => !antIdByName.has(a.name));
    if (toInsertAnt.length) {
      for (const group of chunk(toInsertAnt, BATCH_SIZE)) {
        await db.insert(radiolinesAntennaTypes).values(group.map((a) => ({ name: a.name, manufacturer_id: a.manufacturer_id })));
      }
      const newAnt = await db.query.radiolinesAntennaTypes.findMany({
        where: { name: { in: toInsertAnt.map((a) => a.name) } },
      });
      for (const a of newAnt) antIdByName.set(a.name, a.id);
    }
  }

  console.log("[radiolines] Upserting transmitter types...");
  const txTypesRaw = Array.from(txTypeTuples).map((s) => {
    const [name, man] = s.split("|");
    return { name, manufacturer_id: man ? (manufIdByName.get(man) ?? null) : null } as { name: string | undefined; manufacturer_id: number | null };
  });
  const txTypesDeduped = new Map<string, (typeof txTypesRaw)[number] & { name: string }>();
  for (const t of txTypesRaw.filter(isNonEmptyName)) {
    if (!txTypesDeduped.has(t.name)) txTypesDeduped.set(t.name, t);
  }
  const txTypes = Array.from(txTypesDeduped.values());
  const txIdByName = new Map<string, number>();
  if (txTypes.length) {
    const existingTx = await db.query.radiolinesTransmitterTypes.findMany({
      where: { name: { in: txTypes.map((t) => t.name) } },
    });
    for (const t of existingTx) txIdByName.set(t.name, t.id);

    const toInsertTx = txTypes.filter((t) => !txIdByName.has(t.name));
    if (toInsertTx.length) {
      for (const group of chunk(toInsertTx, BATCH_SIZE)) {
        await db.insert(radiolinesTransmitterTypes).values(group.map((t) => ({ name: t.name, manufacturer_id: t.manufacturer_id })));
      }
      const newTx = await db.query.radiolinesTransmitterTypes.findMany({
        where: { name: { in: toInsertTx.map((t) => t.name) } },
      });
      for (const t of newTx) txIdByName.set(t.name, t.id);
    }
  }

  console.log("[radiolines] Upserting operators...");
  const radioOpNames = Array.from(new Set(rows.map((r) => String(r.Operator || "").trim()).filter((s) => s.length > 0)));
  console.log(`[radiolines] Found ${radioOpNames.length} unique operators`);
  const radioOpsIdByName = await upsertUkeOperators(radioOpNames);

  console.log("[radiolines] Preparing radioline records...");
  const values = rows.map((r) => {
    const tx_lon = convertDMSToDD(r.Dl_geo_Tx) ?? 0;
    const tx_lat = convertDMSToDD(r.Sz_geo_Tx) ?? 0;
    const rx_lon = convertDMSToDD(r.Dl_geo_Rx) ?? 0;
    const rx_lat = convertDMSToDD(r.Sz_geo_Rx) ?? 0;
    const ghzStr = String(r["f [GHz]"] || "");
    const ghz = Number.parseFloat(ghzStr);
    const freq = Math.round((Number.isFinite(ghz) ? ghz : 0) * 1000);
    const ch_num = Number(r.Nr_kan) || null;
    const polarization = String(r.Polaryzacja || "").trim() || null;
    const operator_id = radioOpsIdByName.get(stripCompanySuffixForName(String(r.Operator || "").trim())) ?? null;
    const physical_key = buildPhysicalKey({
      operator_id,
      tx_longitude: tx_lon,
      tx_latitude: tx_lat,
      rx_longitude: rx_lon,
      rx_latitude: rx_lat,
      freq,
      polarization,
      ch_num,
    });

    return {
      tx_longitude: tx_lon,
      tx_latitude: tx_lat,
      tx_height: Number(r["H_t_Tx [m npm]"]) || 0,
      tx_city: String(r["Miejscowość Tx"] || "").trim() || null,
      tx_province: String(r["Województwo Tx"] || "").trim() || null,
      tx_street: String(r["Ulica Tx"] || "").trim() || null,
      tx_location_description: String(r["Opis położenia Tx"] || "").trim() || null,

      rx_longitude: rx_lon,
      rx_latitude: rx_lat,
      rx_height: Number(r["H_t_Rx [m npm]"]) || 0,
      rx_city: String(r["Miejscowość Rx"] || "").trim() || null,
      rx_province: String(r["Województwo Rx"] || "").trim() || null,
      rx_street: String(r["Ulica Rx"] || "").trim() || null,
      rx_location_description: String(r["Opis położenia Rx"] || "").trim() || null,

      freq,
      ch_num,
      plan_symbol: String(r.Symbol_planu || "").trim() || null,
      ch_width: Number(String(r["Szer_kan [MHz]"] || "")) || null,
      polarization,
      modulation_type: String(r["Rodz_modu-lacji"] || "").trim() || null,
      bandwidth: r["Przepływność [Mb/s]"] === null || r["Przepływność [Mb/s]"] === undefined ? null : String(r["Przepływność [Mb/s]"]),

      tx_eirp: Number(String(r["EIRP [dBm]"] || "")) || null,
      tx_antenna_attenuation: Number(String(r["Tłum_ant_odb_Rx [dB]"] || "")) || null,
      tx_transmitter_type_id: txIdByName.get(String(r.Typ_nad || "").trim()) ?? null,
      tx_antenna_type_id: antIdByName.get(String(r.Typ_ant_Tx || "").trim()) ?? null,
      tx_antenna_gain: Number(String(r["Zysk_ant_Tx [dBi]"] || "")) || null,
      tx_antenna_height: Number(r["H_ant_Tx [m npt]"]) || null,

      rx_antenna_type_id: antIdByName.get(String(r.Typ_ant_Rx || "").trim()) ?? null,
      rx_antenna_gain: Number(String(r["Zysk_ant_Rx [dBi]"] || "")) || null,
      rx_antenna_height: Number(r["H_ant_Rx [m npt]"]) || null,
      rx_noise_figure: Number(String(r["Liczba_szum_Rx [dB]"] || "")) || null,
      rx_atpc_attenuation: Number(String(r["Tłum_ATPC [dB]"] || "")) || null,

      operator_id,
      physical_key,
      permit_number: String(r["Nr_pozw/dec"] || "").trim(),
      decision_type: (r.Rodz_dec === "zmP" ? "zmP" : "P") as "zmP" | "P",
      issue_date: parseExcelDate(r.Data_wydania),
      expiry_date: parseExcelDate(r["Data_ważn_pozw/dec"]),
      createdAt: fileDate,
      updatedAt: fileDate,
    };
  });

  console.log("[radiolines] Loading existing radiolines...");
  const existingRadiolines = await db.select().from(ukeRadiolines);
  const existingByKey = new Map<string, UkeRadiolineSelect>();

  for (const row of existingRadiolines) {
    const key = buildAuthorizationKey(row);
    if (!existingByKey.has(key)) existingByKey.set(key, row);
  }

  const seenExistingIds = new Set<number>();
  const toInsert: UkeRadiolineInsert[] = [];
  const toUpdate: { id: number; value: UkeRadiolineInsert }[] = [];

  for (const value of values) {
    const existing = existingByKey.get(buildAuthorizationKey(value));
    if (!existing) {
      toInsert.push(value);
      continue;
    }

    seenExistingIds.add(existing.id);
    if (hasRadiolineChanges(existing, value)) toUpdate.push({ id: existing.id, value });
  }

  const staleRadiolines = existingRadiolines.filter((row) => !seenExistingIds.has(row.id));

  console.log(`[radiolines] Inserting ${toInsert.length} new radiolines...`);
  for (const group of chunk(toInsert, BATCH_SIZE)) {
    if (group.length) await db.insert(ukeRadiolines).values(group);
  }

  console.log(`[radiolines] Updating ${toUpdate.length} changed radiolines...`);
  for (const item of toUpdate) {
    await db.update(ukeRadiolines).set(toRadiolineUpdate(item.value)).where(eq(ukeRadiolines.id, item.id));
  }

  const importMetadataId = await recordImportMetadata("radiolines", links, "success");

  console.log("[radiolines] Archiving and deleting stale radiolines...");
  if (staleRadiolines.length > 0) {
    for (const group of chunk(staleRadiolines, BATCH_SIZE)) {
      await db.insert(deletedEntries).values(
        group.map((row) => ({
          source_table: "uke_radiolines",
          source_id: row.id,
          source_type: "radiolines",
          data: row,
          import_id: importMetadataId,
        })),
      );
    }

    for (const group of chunk(staleRadiolines, BATCH_SIZE)) {
      await db.delete(ukeRadiolines).where(
        inArray(
          ukeRadiolines.id,
          group.map((row) => row.id),
        ),
      );
    }
  }

  console.log(`[radiolines] Deleted ${staleRadiolines.length} stale radiolines`);

  console.log("[radiolines] Import completed successfully");
  return true;
}
