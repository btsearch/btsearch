import { ukeRadiolines } from "@openbts/drizzle";
import { db } from "@openbts/drizzle/db";
import { getOperatorColorByName } from "@openbts/shared/operatorUtils";
import {
  calculateDistance,
  calculateRadiolineSpeed,
  formatBandwidth,
  formatDistance,
  formatFrequency,
  formatSpeed,
} from "@openbts/shared/radiolinesUtils";
import { count, max } from "drizzle-orm";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { KMZ_BATCH_SIZE, REGION_BY_TERYT_PREFIX } from "../config.ts";
import { createLogger } from "../utils.ts";
import { buildKmz, escapeXml, folder, hexToKmlColor, lineStyle, placemark, wrapKml } from "./kml-utils.ts";

const PROVINCE_TO_REGION_CODE: Record<string, string> = Object.fromEntries(
  Object.values(REGION_BY_TERYT_PREFIX).map(({ name, code }) => [name.toLowerCase(), code]),
);

const logger = createLogger("radiolines-kmz");

type RadiolineRow = {
  id: number;
  tx_longitude: number;
  tx_latitude: number;
  tx_height: number;
  tx_city: string | null;
  tx_province: string | null;
  tx_street: string | null;
  rx_longitude: number;
  rx_latitude: number;
  rx_height: number;
  rx_city: string | null;
  rx_street: string | null;
  freq: number;
  ch_num: number | null;
  ch_width: number | null;
  polarization: string | null;
  modulation_type: string | null;
  bandwidth: string | null;
  tx_eirp: number | null;
  tx_antenna_height: number | null;
  rx_antenna_height: number | null;
  permit_number: string;
  decision_type: string;
  expiry_date: Date;
  operator: { name: string; full_name: string } | null;
  txTransmitterType: { name: string; manufacturer: { name: string } | null } | null;
  txAntennaType: { name: string; manufacturer: { name: string } | null } | null;
  rxAntennaType: { name: string; manufacturer: { name: string } | null } | null;
};

type RadioLinkType = "FDD" | "2+0 FDD" | "XPIC" | "SD" | "UNKNOWN";

interface DuplexGroup {
  key: string;
  entries: RadiolineRow[];
  linkType: RadioLinkType;
}

function getArrayBucket<K, V>(map: Map<K, V[]>, key: K): V[] {
  const existing = map.get(key);
  if (existing) return existing;

  const bucket: V[] = [];
  map.set(key, bucket);
  return bucket;
}

function endpointPairKey(r: RadiolineRow): string {
  const a = `${r.tx_latitude},${r.tx_longitude}`;
  const b = `${r.rx_latitude},${r.rx_longitude}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function directionKey(row: RadiolineRow): string {
  return `${row.tx_latitude},${row.tx_longitude}->${row.rx_latitude},${row.rx_longitude}`;
}

function classifyLinkType(entries: RadiolineRow[]): RadioLinkType {
  const byDirection = new Map<string, RadiolineRow[]>();
  for (const entry of entries) {
    getArrayBucket(byDirection, directionKey(entry)).push(entry);
  }

  const ref = [...byDirection.values()].reduce((a, b) => (a.length >= b.length ? a : b));
  if (ref.length === 1) return "FDD";

  const freqs = new Set(ref.map((e) => e.freq));
  const pols = new Set(ref.map((e) => e.polarization));

  if (freqs.size === 1 && pols.size > 1) return "XPIC";
  if (freqs.size > 1 && pols.size === 1) return "2+0 FDD";
  if (freqs.size === 1 && pols.size === 1) return "SD";
  return "UNKNOWN";
}

function groupIntoLinks(rows: RadiolineRow[]): DuplexGroup[] {
  const groups = new Map<string, RadiolineRow[]>();

  for (const row of rows) {
    const operatorId = row.operator?.name ?? "unknown";
    const key = row.permit_number ? `permit:${operatorId}::${row.permit_number}` : `coords:${operatorId}::${endpointPairKey(row)}`;
    getArrayBucket(groups, key).push(row);
  }

  return [...groups.entries()].map(([key, entries]) => ({
    key,
    entries,
    linkType: classifyLinkType(entries),
  }));
}

async function fetchAllRadiolines(): Promise<RadiolineRow[]> {
  const [countRow] = await db.select({ value: count() }).from(ukeRadiolines);
  const total = countRow?.value ?? 0;
  const pageCount = Math.ceil(total / KMZ_BATCH_SIZE);

  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      db.query.ukeRadiolines.findMany({
        with: {
          operator: true,
          txTransmitterType: { with: { manufacturer: true } },
          txAntennaType: { with: { manufacturer: true } },
          rxAntennaType: { with: { manufacturer: true } },
        },
        limit: KMZ_BATCH_SIZE,
        offset: i * KMZ_BATCH_SIZE,
      }),
    ),
  );

  return pages.flat() as unknown as RadiolineRow[];
}

async function fetchLatestDayRadiolines(): Promise<{ rows: RadiolineRow[]; day: Date | null }> {
  const [maxRow] = await db.select({ value: max(ukeRadiolines.createdAt) }).from(ukeRadiolines);
  const maxDate = maxRow?.value ? new Date(maxRow.value) : null;
  if (!maxDate) return { rows: [], day: null };

  const dayStart = new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), maxDate.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db.query.ukeRadiolines.findMany({
    with: {
      operator: true,
      txTransmitterType: { with: { manufacturer: true } },
      txAntennaType: { with: { manufacturer: true } },
      rxAntennaType: { with: { manufacturer: true } },
    },
    where: { createdAt: { gte: dayStart, lt: dayEnd } },
  });

  return { rows: rows as unknown as RadiolineRow[], day: dayStart };
}

function buildLinkDescription(group: DuplexGroup): string {
  const first = group.entries[0]!;
  const operatorName = first.operator?.name ?? "Unknown";
  const distance = calculateDistance(first.tx_latitude, first.tx_longitude, first.rx_latitude, first.rx_longitude);

  const p1Key = `${first.tx_latitude},${first.tx_longitude}`;
  const p2Key = `${first.rx_latitude},${first.rx_longitude}`;
  const aKey = p1Key <= p2Key ? p1Key : p2Key;

  let dlSpeed = 0;
  let ulSpeed = 0;
  let anyDl = false;
  let anyUl = false;

  const lines: string[] = [];
  lines.push(`<b>Operator:</b> ${escapeXml(operatorName)}`);
  lines.push(`<b>Permit:</b> ${escapeXml(first.permit_number)} [${first.decision_type}]`);
  lines.push(`<b>Link Type:</b> ${group.linkType}`);
  lines.push(`<b>Distance:</b> ${formatDistance(distance)}`);
  lines.push(`<b>Expires:</b> ${first.expiry_date.toISOString().slice(0, 10)}`);

  lines.push("");
  lines.push(
    `<b>TX:</b> ${first.tx_city ?? ""} ${first.tx_street ?? ""} (${first.tx_latitude.toFixed(6)}, ${first.tx_longitude.toFixed(6)}) H: ${first.tx_height}m`,
  );
  lines.push(
    `<b>RX:</b> ${first.rx_city ?? ""} ${first.rx_street ?? ""} (${first.rx_latitude.toFixed(6)}, ${first.rx_longitude.toFixed(6)}) H: ${first.rx_height}m`,
  );

  lines.push("");
  lines.push("<b>Directions:</b>");

  for (const entry of group.entries) {
    const isForward = `${entry.tx_latitude},${entry.tx_longitude}` === aKey;
    const dirParts: string[] = [];
    dirParts.push(isForward ? "A→B" : "B→A");
    dirParts.push(`${formatFrequency(entry.freq)}`);
    if (entry.polarization) dirParts.push(`${entry.polarization}`);
    if (entry.ch_width) dirParts.push(`${entry.ch_width} MHz`);
    if (entry.modulation_type) dirParts.push(`${escapeXml(entry.modulation_type)}`);

    if (entry.ch_width && entry.modulation_type) {
      const speed = calculateRadiolineSpeed(entry.ch_width, entry.modulation_type);
      if (speed !== null) {
        dirParts.push(formatSpeed(speed));
        if (isForward) {
          dlSpeed += speed;
          anyDl = true;
        } else {
          ulSpeed += speed;
          anyUl = true;
        }
      }
    } else if (entry.bandwidth) dirParts.push(`${formatBandwidth(entry.bandwidth)}`);

    if (entry.tx_eirp !== null) dirParts.push(`EIRP: ${entry.tx_eirp} dBm`);
    lines.push(`${dirParts.join(" | ")}`);
  }

  if (anyDl || anyUl) {
    const speedLines = [anyDl ? `<b>Downlink:</b> ${formatSpeed(dlSpeed)}` : null, anyUl ? `<b>Uplink:</b> ${formatSpeed(ulSpeed)}` : null]
      .filter(Boolean)
      .join("  ");
    lines.splice(4, 0, speedLines);
  }

  const txType = first.txTransmitterType;
  const txAnt = first.txAntennaType;
  const rxAnt = first.rxAntennaType;
  if (txType || txAnt || rxAnt) {
    lines.push("");
    lines.push("<b>Equipment:</b>");
    if (txType) lines.push(`TX Radio: ${formatEquipment(txType.name, txType.manufacturer)}`);
    if (txAnt) lines.push(`TX Antenna: ${formatEquipment(txAnt.name, txAnt.manufacturer)}`);
    if (rxAnt) lines.push(`RX Antenna: ${formatEquipment(rxAnt.name, rxAnt.manufacturer)}`);
  }

  return lines.join("<br/>");
}

function formatEquipment(name: string, manufacturer: { name: string } | null): string {
  return `${escapeXml(name)}${manufacturer ? ` (${escapeXml(manufacturer.name)})` : ""}`;
}

function operatorStyleId(operatorName: string): string {
  const slug = operatorName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `line-op-${slug || "default"}`;
}

function getOperatorTypeBuckets(byOperator: Map<string, Map<RadioLinkType, string[]>>, operatorName: string): Map<RadioLinkType, string[]> {
  const existing = byOperator.get(operatorName);
  if (existing) return existing;

  const byType = new Map<RadioLinkType, string[]>();
  byOperator.set(operatorName, byType);
  return byType;
}

function groupLinksByRegion(links: DuplexGroup[]): Map<string, DuplexGroup[]> {
  const byRegion = new Map<string, DuplexGroup[]>();

  for (const link of links) {
    const code = regionCodeForRow(link.entries[0]!);
    getArrayBucket(byRegion, code).push(link);
  }

  return byRegion;
}

function buildRadiolinesKmz(links: DuplexGroup[], title: string): Uint8Array {
  const byOperator = new Map<string, Map<RadioLinkType, string[]>>();
  const operatorStyles = new Map<string, { styleId: string; color: string }>();

  for (const link of links) {
    const first = link.entries[0]!;
    const operatorName = first.operator?.name ?? "Unknown";
    const styleId = operatorStyleId(operatorName);
    if (!operatorStyles.has(styleId)) operatorStyles.set(styleId, { styleId, color: getOperatorColorByName(operatorName) });

    const styleUrl = `#${styleId}`;
    const name = `${formatFrequency(first.freq)} [${link.linkType}]`;
    const description = buildLinkDescription(link);
    const coords = `<LineString><coordinates>${first.tx_longitude},${first.tx_latitude},0 ${first.rx_longitude},${first.rx_latitude},0</coordinates></LineString>`;
    const pm = placemark(name, description, coords, styleUrl, undefined, false);

    const byType = getOperatorTypeBuckets(byOperator, operatorName);
    getArrayBucket(byType, link.linkType).push(pm);
  }

  const styles = [...operatorStyles.values()].map(({ styleId, color }) => lineStyle(styleId, hexToKmlColor(color), 2)).join("\n");

  const operatorFolders = [...byOperator.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([opName, byType]) => {
      const typeFolders = [...byType.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([linkType, pms]) => folder(`${linkType} (${pms.length})`, pms.join("\n"), true, false));
      return folder(`${opName} (${[...byType.values()].reduce((s, v) => s + v.length, 0)})`, typeFolders.join("\n"), false, false);
    });

  return buildKmz(wrapKml(title, `${styles}\n${operatorFolders.join("\n")}`));
}

function writeKmz(filePath: string, kmz: Uint8Array): void {
  writeFileSync(filePath, kmz);
  logger.log(`Written ${filePath} (${(kmz.length / 1024 / 1024).toFixed(2)} MB)`);
}

function regionCodeForRow(row: RadiolineRow): string {
  const province = row.tx_province?.toLowerCase().trim() ?? "";
  return PROVINCE_TO_REGION_CODE[province] ?? "UNKNOWN";
}

export async function generateRadiolinesKmz(outputDir: string, dateStr: string): Promise<void> {
  mkdirSync(outputDir, { recursive: true });

  logger.log("Fetching radiolines from database...");
  const rows = await fetchAllRadiolines();
  logger.log(`Fetched ${rows.length} radiolines`);

  const links = groupIntoLinks(rows);
  logger.log(`Grouped into ${links.length} duplex links`);

  const globalKmz = buildRadiolinesKmz(links, "Radiolinie UKE");
  writeKmz(path.join(outputDir, `radiolines_${dateStr}.kmz`), globalKmz);

  const byRegion = groupLinksByRegion(links);

  for (const [code, regionLinks] of [...byRegion.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const kmz = buildRadiolinesKmz(regionLinks, `Radiolinie UKE - ${code}`);
    writeKmz(path.join(outputDir, `radiolines_${dateStr}_${code}.kmz`), kmz);
  }

  logger.log(`Generated ${byRegion.size} regional radiolines KMZ files`);

  logger.log("Fetching radiolines created on the latest day...");
  const { rows: latestRows, day } = await fetchLatestDayRadiolines();
  if (!day || latestRows.length === 0) {
    logger.log("No radiolines found for the latest createdAt day");
    return;
  }

  const dayStr = day.toISOString().slice(0, 10);
  logger.log(`Latest createdAt day: ${dayStr} (${latestRows.length} radiolines)`);

  const newLinks = groupIntoLinks(latestRows);
  const newKmz = buildRadiolinesKmz(newLinks, `Radiolinie UKE - nowe (${dayStr})`);
  writeKmz(path.join(outputDir, `radiolines_new_${dayStr}.kmz`), newKmz);
}
