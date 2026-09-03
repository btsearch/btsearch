import { stationsPermits } from "@openbts/drizzle";
/* eslint-disable no-await-in-loop */

import { BATCH_SIZE } from "../config.js";
import { db } from "../database.js";
import { recordImportMetadata } from "../import-check.js";
import { chunk, createLogger } from "../utils.js";

interface AssociationPermit {
  id: number;
  station: {
    id: number;
    station_id: string;
    operator_id: number;
    location: {
      longitude: number;
      latitude: number;
    };
  };
}

interface MatchingStation {
  id: number;
  station_id: string;
  operator_id: number | null;
  location: {
    longitude: number;
    latitude: number;
  } | null;
}

interface AssociationInsert {
  permit_id: number;
  station_id: number;
}

export interface InsertedStationPermitAssociation {
  permitId: number;
  stationId: number;
}

interface AssociationBuildResult {
  associations: AssociationInsert[];
  skippedMissingMatch: number;
  skippedAmbiguous: number;
}

const logger = createLogger("stations");

function getPairKey(stationId: string, operatorId: number): string {
  return `${stationId}:${operatorId}`;
}

function getLocationKey(pairKey: string, longitude: number, latitude: number): string {
  return `${pairKey}:${longitude}:${latitude}`;
}

function buildInternalStationLookups(matchingStations: MatchingStation[]): {
  stationsByPairKey: Map<string, number>;
  stationsByLocationKey: Map<string, number>;
} {
  const stationsByPairKey = new Map<string, number>();
  const stationsByLocationKey = new Map<string, number>();

  for (const station of matchingStations) {
    if (station.operator_id === null) continue;

    const pairKey = getPairKey(station.station_id, station.operator_id);
    stationsByPairKey.set(pairKey, station.id);
    if (station.location) stationsByLocationKey.set(getLocationKey(pairKey, station.location.longitude, station.location.latitude), station.id);
  }

  return { stationsByPairKey, stationsByLocationKey };
}

function countUkeStationsByPair(permits: AssociationPermit[]): Map<string, Set<number>> {
  const ukeStationsByPair = new Map<string, Set<number>>();

  for (const permit of permits) {
    const pairKey = getPairKey(permit.station.station_id, permit.station.operator_id);
    const stationIds = ukeStationsByPair.get(pairKey) ?? new Set<number>();
    stationIds.add(permit.station.id);
    ukeStationsByPair.set(pairKey, stationIds);
  }

  return ukeStationsByPair;
}

function buildAssociations(permits: AssociationPermit[], matchingStations: MatchingStation[]): AssociationBuildResult {
  const { stationsByPairKey, stationsByLocationKey } = buildInternalStationLookups(matchingStations);
  const ukeStationsByPair = countUkeStationsByPair(permits);
  const associations: AssociationInsert[] = [];
  let skippedMissingMatch = 0;
  let skippedAmbiguous = 0;

  for (const permit of permits) {
    const pairKey = getPairKey(permit.station.station_id, permit.station.operator_id);
    const locationKey = getLocationKey(pairKey, permit.station.location.longitude, permit.station.location.latitude);
    const pairStationCount = ukeStationsByPair.get(pairKey)?.size ?? 0;
    const locationStationId = stationsByLocationKey.get(locationKey);
    const pairStationId = pairStationCount === 1 ? stationsByPairKey.get(pairKey) : undefined;
    const internalStationId = locationStationId ?? pairStationId;

    if (internalStationId !== undefined) associations.push({ permit_id: permit.id, station_id: internalStationId });
    else if (pairStationCount > 1) skippedAmbiguous++;
    else skippedMissingMatch++;
  }

  return { associations, skippedMissingMatch, skippedAmbiguous };
}

function deduplicateAssociations(associations: AssociationInsert[]): AssociationInsert[] {
  return Array.from(new Map(associations.map((association) => [`${association.permit_id}:${association.station_id}`, association])).values());
}

export async function associateStationsWithPermits(): Promise<InsertedStationPermitAssociation[]> {
  logger.log("Associating stations with permits...");
  const permits: AssociationPermit[] = await db.query.ukePermits.findMany({
    columns: { id: true },
    with: {
      station: {
        columns: { id: true, station_id: true, operator_id: true },
        with: {
          location: {
            columns: { longitude: true, latitude: true },
          },
        },
      },
    },
  });
  logger.log(`Found ${permits.length} permits`);

  if (!permits.length) {
    logger.log("No permits found, skipping association");
    await recordImportMetadata("stations_permits", [], "success");
    return [];
  }

  const permitStationIds = [...new Set(permits.map((permit) => permit.station.station_id))];
  const permitOperatorIds = [...new Set(permits.map((permit) => permit.station.operator_id))];
  logger.log(`Looking for ${permitStationIds.length} unique station IDs across ${permitOperatorIds.length} operators`);

  const matchingStations: MatchingStation[] = await db.query.stations.findMany({
    where: { station_id: { in: permitStationIds }, operator_id: { in: permitOperatorIds } },
    columns: { id: true, station_id: true, operator_id: true },
    with: {
      location: {
        columns: { longitude: true, latitude: true },
      },
    },
  });
  logger.log(`Found ${matchingStations.length} matching stations`);

  if (!matchingStations.length) {
    logger.log("No matching stations found, skipping association");
    await recordImportMetadata("stations_permits", [], "success");
    return [];
  }

  const { associations: allAssociations, skippedMissingMatch, skippedAmbiguous } = buildAssociations(permits, matchingStations);
  if (skippedMissingMatch > 0) logger.warn(`Skipped ${skippedMissingMatch} permits (no station with matching station_id + operator)`);
  if (skippedAmbiguous > 0) logger.warn(`Skipped ${skippedAmbiguous} permits (ambiguous station_id + operator across UKE locations)`);

  if (!allAssociations.length) {
    logger.log("No associations to create");
    await recordImportMetadata("stations_permits", [], "success");
    return [];
  }

  const associations = deduplicateAssociations(allAssociations);
  logger.log(`Creating up to ${associations.length} associations`);

  const insertedAssociations: InsertedStationPermitAssociation[] = [];
  for (const group of chunk(associations, BATCH_SIZE)) {
    const inserted = await db
      .insert(stationsPermits)
      .values(group)
      .onConflictDoNothing({ target: [stationsPermits.station_id, stationsPermits.permit_id] })
      .returning({ permitId: stationsPermits.permit_id, stationId: stationsPermits.station_id });
    insertedAssociations.push(
      ...inserted.filter(
        (association): association is InsertedStationPermitAssociation => association.permitId !== null && association.stationId !== null,
      ),
    );
  }

  await recordImportMetadata("stations_permits", [], "success");
  logger.log(`Association completed successfully (${insertedAssociations.length} inserted)`);
  return insertedAssociations;
}
