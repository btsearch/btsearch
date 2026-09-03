import { ukePermitSectors, ukePermits } from "@openbts/drizzle";
/* eslint-disable no-await-in-loop */

import { BATCH_SIZE } from "../config.js";
import { db } from "../database.js";
import { findCreatedPermitStationIds } from "../permit-activity.js";
import { getUkePermitKey } from "../permit-key.js";
import { getUkeStationKey, refreshUkeStationActivity, resolveUkeStationIds } from "../uke-stations.js";
import { upsertUkeLocations } from "../upserts.js";
import { chunk, createLogger } from "../utils.js";
import type { ParsedDeviceRegistryRow } from "./parser.js";

const logger = createLogger("device-registry");

export async function persistDeviceRegistryRows(
  rows: ParsedDeviceRegistryRow[],
  operatorId: number,
  regionIds: Map<string, number>,
  bandMap: Map<string, number>,
  fileDate: Date,
): Promise<number> {
  const locationItems = rows.map((row) => ({
    regionName: row.regionName,
    city: row.city,
    address: row.address,
    lon: row.lon,
    lat: row.lat,
  }));
  const locationIdByLonLat = await upsertUkeLocations(locationItems, regionIds);

  const values = rows
    .map((row) => {
      const locationKey = `${row.lon}:${row.lat}`;
      const location_id = locationIdByLonLat.get(locationKey);
      if (!location_id) {
        logger.log("Missing location_id for key:", locationKey);
        return null;
      }

      const bandId = bandMap.get(row.bandKey);
      if (!bandId) {
        logger.log("Missing bandId for key:", row.bandKey);
        return null;
      }

      return {
        station: {
          station_id: row.stationId,
          operator_id: operatorId,
          location_id,
          createdAt: fileDate,
          updatedAt: fileDate,
        },
        permit: {
          decision_number: row.decisionNumber,
          decision_type: row.decisionType,
          expiry_date: new Date("2099-12-31T23:59:59Z"),
          band_id: bandId,
          source: "device_registry" as const,
          createdAt: fileDate,
          updatedAt: fileDate,
        },
        sector: {
          azimuth: row.azimuth,
          elevation: row.elevation,
          antenna_height: row.antennaHeight,
          antenna_type: row.antennaType,
        },
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  const stationIdByKey = await resolveUkeStationIds(values.map((value) => value.station));
  const permitValues = values
    .map((value) => {
      const ukeStationId = stationIdByKey.get(getUkeStationKey(value.station));
      if (ukeStationId === undefined) {
        logger.warn(`Could not resolve UKE station ID for station ${value.station.station_id}`);
        return null;
      }
      return { ...value, permit: { ...value.permit, uke_station_id: ukeStationId } };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);

  const permitsByKey = new Map<string, (typeof permitValues)[number]["permit"]>();
  const sectorsByPermitKey = new Map<string, Array<(typeof values)[number]["sector"]>>();
  for (const row of permitValues) {
    const permitKey = getUkePermitKey(row.permit);
    permitsByKey.set(permitKey, row.permit);
    const sectors = sectorsByPermitKey.get(permitKey) ?? [];
    sectors.push(row.sector);
    sectorsByPermitKey.set(permitKey, sectors);
  }

  const uniquePermits = Array.from(permitsByKey.entries());
  const createdPermitStationIds = await findCreatedPermitStationIds(uniquePermits.map(([, permit]) => permit));

  let insertedCount = 0;
  for (const group of chunk(uniquePermits, BATCH_SIZE)) {
    if (group.length) {
      const permitRows = group.map(([, permit]) => permit);
      const inserted = await db
        .insert(ukePermits)
        .values(permitRows)
        .onConflictDoUpdate({
          target: [ukePermits.uke_station_id, ukePermits.band_id, ukePermits.decision_number, ukePermits.decision_type, ukePermits.expiry_date],
          set: { updatedAt: fileDate, source: "device_registry" },
        })
        .returning({
          id: ukePermits.id,
          uke_station_id: ukePermits.uke_station_id,
          band_id: ukePermits.band_id,
          decision_number: ukePermits.decision_number,
          decision_type: ukePermits.decision_type,
          expiry_date: ukePermits.expiry_date,
        });

      const sectorValues: Array<{
        permit_id: number;
        azimuth: number | null;
        elevation: number | null;
        antenna_height: number | null;
        antenna_type: "indoor" | "outdoor" | null;
      }> = [];
      for (const permit of inserted) {
        const sectors = sectorsByPermitKey.get(getUkePermitKey(permit)) ?? [];
        for (const sector of sectors) sectorValues.push({ permit_id: permit.id, ...sector });
      }

      if (sectorValues.length) {
        for (const sectorGroup of chunk(sectorValues, BATCH_SIZE)) await db.insert(ukePermitSectors).values(sectorGroup).onConflictDoNothing();
      }

      insertedCount += group.length;
    }
  }

  await refreshUkeStationActivity(createdPermitStationIds);
  return insertedCount;
}
