import assert from "node:assert/strict";
import test from "node:test";

import type { MatchedStation } from "../../src/features/nsg-explorer/stations/correlation";
import { mergeMatchedStationLocations } from "../../src/features/nsg-explorer/stations/locations";
import type { AnalyzerStation } from "../../src/lib/analyzer/api";
import type { LocationWithStations } from "../../src/types/station";

const TIMESTAMP = "2026-09-06T00:00:00.000Z";

function analyzerStation(id: number, locationId: number): AnalyzerStation {
  return {
    id,
    station_id: `station-${id}`,
    notes: null,
    extra_address: null,
    updatedAt: TIMESTAMP,
    createdAt: TIMESTAMP,
    statusChangedAt: TIMESTAMP,
    is_confirmed: true,
    operator: { id, name: `Operator ${id}`, full_name: `Operator ${id}`, parent_id: null, mnc: 26000 + id },
    location: {
      id: locationId,
      city: `City ${locationId}`,
      address: null,
      longitude: 20 + locationId / 100,
      latitude: 50 + locationId / 100,
      updatedAt: TIMESTAMP,
      createdAt: TIMESTAMP,
      region: { id: 1, name: "Region", code: "REG" },
    },
  };
}

function match(id: number, locationId: number, confidence: MatchedStation["confidence"] = "exact"): MatchedStation {
  return {
    station: analyzerStation(id, locationId),
    confidence,
  };
}

void test("merges Analyzer matches into the standard source without duplicating fetched stations", () => {
  const fetched: LocationWithStations[] = [
    {
      id: 10,
      city: "Fetched city",
      address: "Fetched address",
      longitude: 20.1,
      latitude: 50.1,
      updatedAt: TIMESTAMP,
      createdAt: TIMESTAMP,
      region: { id: 1, name: "Region", code: "REG" },
      stations: [
        {
          id: 1,
          station_id: "station-1",
          operator_id: 1,
          notes: null,
          extra_address: null,
          updatedAt: TIMESTAMP,
          createdAt: TIMESTAMP,
          is_confirmed: true,
          status: "published",
          operator: { id: 1, name: "Operator 1", full_name: "Operator 1", parent_id: null, mnc: 26001 },
        },
      ],
    },
  ];

  const merged = mergeMatchedStationLocations(fetched, [match(1, 10), match(2, 10), match(3, 20)]);

  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged[0].stations.map((station) => station.id),
    [1, 2],
  );
  assert.equal(merged[1].id, 20);
  assert.equal(merged[1].stations[0].id, 3);
  assert.equal(merged[1].stations[0].operator_id, 3);
  assert.equal(merged[1].stations[0].status, "published");
  assert.deepEqual(
    fetched[0].stations.map((station) => station.id),
    [1],
  );
});
