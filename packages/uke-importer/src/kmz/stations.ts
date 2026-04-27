import { ukePermits } from "@openbts/drizzle";
import { db } from "@openbts/drizzle/db";
import { getOperatorColor, resolveOperatorMnc } from "@openbts/shared/operatorUtils";
import { destinationPoint } from "@openbts/shared/radiolinesUtils";
import { count, max } from "drizzle-orm";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { KMZ_BATCH_SIZE } from "../config.ts";
import { createLogger } from "../utils.ts";
import { buildKmz, escapeXml, folder, hexToKmlColor, iconStyle, lineStyle, placemark, wrapKml } from "./kml-utils.ts";

const logger = createLogger("stations-kmz");

const AZIMUTH_LINE_LENGTH_M = 300;

type PermitRow = {
  id: number;
  station_id: string;
  decision_number: string;
  decision_type: string;
  expiry_date: Date;
  source: string;
  operator: { name: string; full_name: string } | null;
  location: {
    longitude: number;
    latitude: number;
    city: string | null;
    address: string | null;
    region: { name: string; code: string } | null;
  } | null;
  band: { name: string; rat: string; value: number | null; duplex: string | null } | null;
  sectors: { azimuth: number | null; elevation: number | null; antenna_height: number | null; antenna_type: string | null }[];
};

async function fetchLatestDayPermits(): Promise<{ rows: PermitRow[]; day: Date | null }> {
  const [maxRow] = await db.select({ value: max(ukePermits.createdAt) }).from(ukePermits);
  const maxDate = maxRow?.value ? new Date(maxRow.value) : null;
  if (!maxDate) return { rows: [], day: null };

  const dayStart = new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), maxDate.getUTCDate()));
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const rows = await db.query.ukePermits.findMany({
    with: {
      operator: true,
      location: { with: { region: true } },
      band: true,
      sectors: true,
    },
    where: { createdAt: { gte: dayStart, lt: dayEnd } },
  });

  return { rows: rows as unknown as PermitRow[], day: dayStart };
}

async function fetchAllPermits(): Promise<PermitRow[]> {
  const [countRow] = await db.select({ value: count() }).from(ukePermits);
  const total = countRow?.value ?? 0;
  const pageCount = Math.ceil(total / KMZ_BATCH_SIZE);

  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) =>
      db.query.ukePermits.findMany({
        with: {
          operator: true,
          location: { with: { region: true } },
          band: true,
          sectors: true,
        },
        limit: KMZ_BATCH_SIZE,
        offset: i * KMZ_BATCH_SIZE,
      }),
    ),
  );

  return pages.flat() as unknown as PermitRow[];
}

function buildStationDescription(station: StationGroup): string {
  const first = station.permits[0];
  const lines: string[] = [];

  if (first?.location) {
    const loc = first.location;
    if (loc.city) lines.push(`<b>City:</b> ${escapeXml(loc.city)}`);
    if (loc.address) lines.push(`<b>Address:</b> ${escapeXml(loc.address)}`);
    if (loc.region) lines.push(`<b>Region:</b> ${escapeXml(loc.region.name)}`);
  }

  const azimuths = [...station.azimuths].sort((a, b) => a - b);
  if (azimuths.length > 0) lines.push(`<b>Azimuths:</b> ${azimuths.map((a) => `${a}°`).join(", ")}`);

  lines.push("");
  lines.push(`<b>Permits (${station.permits.length}):</b>`);

  for (const permit of station.permits) {
    const band = permit.band ? `${escapeXml(permit.band.name)}` : "-";
    const expiry = permit.expiry_date.toISOString().slice(0, 10);
    lines.push(`${band}: ${escapeXml(permit.decision_number)} [${permit.decision_type}] - expires ${expiry}`);
  }

  return lines.join("<br/>");
}

interface StationGroup {
  station_id: string;
  operator_name: string;
  operator_mnc: number | null;
  longitude: number;
  latitude: number;
  region_code: string;
  permits: PermitRow[];
  azimuths: Set<number>;
}

interface OperatorKmzBuckets {
  stationPlacemarks: string[];
  azimuthPlacemarks: string[];
}

function groupByStation(permits: PermitRow[]): StationGroup[] {
  const map = new Map<string, StationGroup>();

  for (const permit of permits) {
    if (!permit.location) continue;

    const key = `${permit.station_id}|${permit.location.longitude}|${permit.location.latitude}`;
    let group = map.get(key);
    if (!group) {
      group = {
        station_id: permit.station_id,
        operator_name: permit.operator?.name ?? "Unknown",
        operator_mnc: resolveOperatorMnc(null, permit.operator?.name ?? null),
        longitude: permit.location.longitude,
        latitude: permit.location.latitude,
        region_code: permit.location.region?.code ?? "UNKNOWN",
        permits: [],
        azimuths: new Set(),
      };
      map.set(key, group);
    }
    group.permits.push(permit);
    for (const sector of permit.sectors) {
      if (sector.azimuth !== null) group.azimuths.add(sector.azimuth);
    }
  }

  return Array.from(map.values());
}

function getOperatorBuckets(byOperator: Map<string, OperatorKmzBuckets>, operatorName: string): OperatorKmzBuckets {
  const existing = byOperator.get(operatorName);
  if (existing) return existing;

  const buckets = { stationPlacemarks: [], azimuthPlacemarks: [] };
  byOperator.set(operatorName, buckets);
  return buckets;
}

function groupStationsByRegion(stations: StationGroup[]): Map<string, StationGroup[]> {
  const byRegion = new Map<string, StationGroup[]>();

  for (const station of stations) {
    const regionStations = byRegion.get(station.region_code);
    if (regionStations) regionStations.push(station);
    else byRegion.set(station.region_code, [station]);
  }

  return byRegion;
}

function azimuthStyleId(mnc: number | null): string {
  return `azimuth-${mnc ?? "default"}`;
}

function stationIconStyleId(mnc: number | null): string {
  return `station-icon-${mnc ?? "default"}`;
}

function buildStationsKmz(stations: StationGroup[], title: string): Uint8Array {
  const byOperator = new Map<string, OperatorKmzBuckets>();
  const operatorMncs = new Map<string, number | null>();

  for (const station of stations) {
    const op = getOperatorBuckets(byOperator, station.operator_name);
    operatorMncs.set(station.operator_name, station.operator_mnc);

    const bandsSummary = [...new Set(station.permits.map((p) => p.band?.name).filter(Boolean))].join(", ");
    const stationName = station.station_id;

    op.stationPlacemarks.push(
      placemark(
        stationName,
        `<b>Bands:</b> ${escapeXml(bandsSummary)}<br/>${buildStationDescription(station)}`,
        `<Point><coordinates>${station.longitude},${station.latitude},0</coordinates></Point>`,
        `#${stationIconStyleId(station.operator_mnc)}`,
        undefined,
        false,
      ),
    );

    for (const az of station.azimuths) {
      const [endLat, endLon] = destinationPoint(station.latitude, station.longitude, az, AZIMUTH_LINE_LENGTH_M);
      op.azimuthPlacemarks.push(
        placemark(
          `${stationName}`,
          `<b>Azimuth:</b> ${az}°`,
          `<LineString><coordinates>${station.longitude},${station.latitude},0 ${endLon},${endLat},0</coordinates></LineString>`,
          `#${azimuthStyleId(station.operator_mnc)}`,
          undefined,
          false,
        ),
      );
    }
  }

  const sortedOperators = [...byOperator.entries()].sort(([a], [b]) => a.localeCompare(b));

  const stationFolders = sortedOperators.map(([op, { stationPlacemarks }]) => folder(op, stationPlacemarks.join("\n"), false, false));
  const azimuthFolders = sortedOperators.map(([op, { azimuthPlacemarks }]) => folder(op, azimuthPlacemarks.join("\n"), false, false));

  const seenMncs = new Set<string>();
  const uniqueMncs = [...operatorMncs.values()].filter((mnc) => {
    const key = String(mnc);
    if (seenMncs.has(key)) return false;
    seenMncs.add(key);
    return true;
  });

  const azimuthStyles = uniqueMncs.map((mnc) => lineStyle(azimuthStyleId(mnc), hexToKmlColor(getOperatorColor(mnc ?? -1)), 2));

  const stationIconStyles = uniqueMncs.map((mnc) =>
    iconStyle(
      stationIconStyleId(mnc),
      "http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png",
      0.9,
      hexToKmlColor(getOperatorColor(mnc ?? -1)),
    ),
  );

  const styles = [...stationIconStyles, ...azimuthStyles].join("\n");
  const content = [styles, folder("Stacje", stationFolders.join("\n"), true, false), folder("Azymuty", azimuthFolders.join("\n"), false, false)].join(
    "\n",
  );

  return buildKmz(wrapKml(title, content));
}

type PermitsSource = "permits" | "device_registry";
const SOURCES: PermitsSource[] = ["permits", "device_registry"];

function writeKmz(filePath: string, kmz: Uint8Array): void {
  writeFileSync(filePath, kmz);
  logger.log(`Written ${filePath} (${(kmz.length / 1024 / 1024).toFixed(2)} MB)`);
}

function writeStationSet(stations: StationGroup[], outputDir: string, filePrefix: string, titleSuffix = ""): void {
  const title = `Pozwolenia UKE ${titleSuffix}`;
  writeKmz(path.join(outputDir, `${filePrefix}.kmz`), buildStationsKmz(stations, title));

  for (const [code, regionStations] of [...groupStationsByRegion(stations).entries()].sort(([a], [b]) => a.localeCompare(b))) {
    writeKmz(path.join(outputDir, `${filePrefix}_${code}.kmz`), buildStationsKmz(regionStations, `${title} - ${code}`));
  }
}

export async function generateStationsKmz(outputDir: string, dateStr: string): Promise<void> {
  mkdirSync(outputDir, { recursive: true });

  logger.log("Fetching permits from database...");
  const allPermits = await fetchAllPermits();
  logger.log(`Fetched ${allPermits.length} permits`);

  const allStations = groupByStation(allPermits);
  logger.log(`Grouped into ${allStations.length} station locations`);

  writeStationSet(allStations, outputDir, `stations_${dateStr}`);

  for (const source of SOURCES) {
    const sourceDir = path.join(outputDir, source);
    mkdirSync(sourceDir, { recursive: true });
    const sourceStations = groupByStation(allPermits.filter((p) => p.source === source));
    logger.log(`Source ${source}: ${sourceStations.length} stations`);
    writeStationSet(sourceStations, sourceDir, `stations_${dateStr}_${source}`, ` - ${source}`);
  }

  logger.log("Fetching permits created on the latest day...");
  const { rows: latestPermits, day } = await fetchLatestDayPermits();
  if (!day || latestPermits.length === 0) {
    logger.log("No permits found for the latest createdAt day");
    return;
  }

  const dayStr = day.toISOString().slice(0, 10);
  const newStations = groupByStation(latestPermits);
  logger.log(`Latest createdAt day: ${dayStr} (${latestPermits.length} permits, ${newStations.length} stations)`);
  writeKmz(path.join(outputDir, `stations_new_${dayStr}.kmz`), buildStationsKmz(newStations, `Pozwolenia UKE - nowe (${dayStr})`));
}
