import type { Operator, Region } from "@openbts/shared/contract";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { type ViteDevServer, createServer } from "vite";

import type { MapLookups } from "../../src/features/map/data/mapLookups";
import type { MapPoint } from "../../src/features/map/data/mapPoints";
import type { MatchedStation } from "../../src/features/nsg-explorer/stations/correlation";
import type { LocatedStation } from "../../src/features/nsg-explorer/stations/match";

const CLIENT_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const TIMESTAMP = "2026-09-06T00:00:00.000Z";
const REGION: Region = { id: 1, countryCode: "PL", code: "REG", name: "Region", isoCode: null };

function operator(id: number): Operator {
  return {
    id,
    countryCode: "PL",
    brandId: null,
    name: `Operator ${id}`,
    legalName: `Operator ${id}`,
    shortCode: null,
    sortPriority: id,
    primaryPlmn: `2600${id}`,
    plmns: [],
    links: [],
  };
}

const OPERATORS = [operator(1), operator(2), operator(3)];
const LOOKUPS: MapLookups = {
  operators: OPERATORS,
  brands: [],
  bands: [],
  countries: [],
  regions: [REGION],
  operatorsById: new Map(OPERATORS.map((entry) => [entry.id, { operator: entry, brand: null, color: "#000000" }])),
  operatorGroups: new Map(),
  bandsById: new Map(),
  regionsById: new Map([[REGION.id, REGION]]),
};

let server: ViteDevServer;
let mapPoints: typeof import("../../src/features/map/data/mapPoints");
let locations: typeof import("../../src/features/nsg-explorer/stations/locations");

before(async () => {
  server = await createServer({
    root: CLIENT_ROOT,
    configFile: false,
    appType: "custom",
    resolve: { alias: { "@": resolve(CLIENT_ROOT, "src") } },
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true },
  });
  mapPoints = (await server.ssrLoadModule("/src/features/map/data/mapPoints.ts")) as unknown as typeof mapPoints;
  locations = (await server.ssrLoadModule("/src/features/nsg-explorer/stations/locations.ts")) as unknown as typeof locations;
});

after(async () => {
  await server.close();
});

function locatedStation(id: number, locationId: number, guestOperatorIds: number[] = []): LocatedStation {
  return {
    id,
    siteId: `S${id}`,
    operatorId: id,
    locationId,
    hostStationId: null,
    status: "active",
    isConfirmed: true,
    notes: null,
    identifiers: [],
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    statusChangedAt: TIMESTAMP,
    guestOperatorIds,
    location: {
      id: locationId,
      countryCode: "PL",
      regionId: REGION.id,
      city: `City ${locationId}`,
      address: null,
      structure: { type: null, owner: null, note: null },
      latitude: 50 + locationId / 100,
      longitude: 20 + locationId / 100,
      createdAt: TIMESTAMP,
      updatedAt: TIMESTAMP,
    },
  };
}

function match(station: LocatedStation): MatchedStation {
  return { station, confidence: "exact" };
}

function fetchedPoint(): MapPoint {
  return {
    source: "internal",
    id: 10,
    countryCode: "PL",
    latitude: 50.1,
    longitude: 20.1,
    city: "Fetched city",
    address: "Fetched address",
    regionName: REGION.name,
    stations: [mapPoints.createMapPointStation({ id: 1, siteId: "S1", operatorId: 1 }, LOOKUPS)],
  };
}

void test("merges matched stations into the fetched points without duplicating fetched stations", () => {
  const fetched = [fetchedPoint()];

  const merged = locations.mergeMatchedStationPoints(
    fetched,
    [match(locatedStation(1, 10)), match(locatedStation(2, 10)), match(locatedStation(3, 20))],
    LOOKUPS,
  );

  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged[0].stations.map((station) => station.id),
    [1, 2],
  );
  assert.equal(merged[1].id, 20);
  assert.equal(merged[1].regionName, REGION.name);
  assert.equal(merged[1].stations[0].id, 3);
  assert.equal(merged[1].stations[0].operatorId, 3);
  assert.equal(merged[1].stations[0].status, "active");
  assert.deepEqual(
    fetched[0].stations.map((station) => station.id),
    [1],
  );
});

void test("keeps the guest operators of a matched station", () => {
  const [point] = locations.mergeMatchedStationPoints([], [match(locatedStation(1, 30, [2]))], LOOKUPS);

  assert.deepEqual(
    point?.stations[0].guests.map((guest) => guest.operatorId),
    [2],
  );
});
