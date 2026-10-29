import { describe, expect, it } from "vitest";

import { findHostStationIds } from "../../../src/features/stations/physicalStations.js";
import { dbMock } from "../../helpers/boundaries.js";

type HostRow = {
  id: number;
  locationId: number | null;
  countryCode: string;
  operatorId: number | null;
  sharedNetworkId: number | null;
  hasOfficialSite: boolean;
};
type StationRow = { id: number; location_id: number | null; ran_host_station_id: number | null };

function row(id: number, operatorId: number, overrides: Partial<HostRow> = {}): HostRow {
  return { id, operatorId, locationId: 1, countryCode: "PL", sharedNetworkId: 7, hasOfficialSite: false, ...overrides };
}

function stationsAt(...locationIds: number[]): StationRow[] {
  return locationIds.map((locationId, index) => ({ id: 10_000 + index, location_id: locationId, ran_host_station_id: null }));
}

function referenceHosts(rows: readonly HostRow[]): Map<number, number> {
  const hosts = new Map<number, number>();
  for (const station of rows) {
    if (station.hasOfficialSite || hosts.has(station.id)) continue;
    const host = rows.find(
      (candidate) =>
        candidate.hasOfficialSite &&
        candidate.locationId === station.locationId &&
        candidate.sharedNetworkId === station.sharedNetworkId &&
        candidate.operatorId !== station.operatorId,
    );
    if (host !== undefined) hosts.set(station.id, host.id);
  }
  return hosts;
}

describe("findHostStationIds", () => {
  it("avoids a query when no station has a location", async () => {
    expect(await findHostStationIds([])).toEqual(new Map());
    expect(await findHostStationIds([{ id: 1, location_id: null, ran_host_station_id: 2 }])).toEqual(new Map());
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("keeps the first eligible host in query order, including inactive holders and several operators", async () => {
    dbMock.enqueueFor("select", "stations", [
      row(100, 10, { hasOfficialSite: true }),
      row(101, 20, { hasOfficialSite: true }),
      row(102, 30, { hasOfficialSite: true }),
      row(199, 10),
      row(200, 20),
      row(201, 30),
      row(1, 20, { hasOfficialSite: true }),
    ]);

    expect(await findHostStationIds(stationsAt(1))).toEqual(
      new Map([
        [199, 101],
        [200, 100],
        [201, 100],
      ]),
    );
  });

  it("keeps the first successful shared-network membership despite duplicate rows", async () => {
    dbMock.enqueueFor("select", "stations", [
      row(1, 1),
      row(1, 1, { sharedNetworkId: 8 }),
      row(1, 1, { sharedNetworkId: 9 }),
      row(1, 1, { sharedNetworkId: 8 }),
      row(2, 2),
      row(5, 2, { hasOfficialSite: true, sharedNetworkId: 9 }),
      row(8, 1, { hasOfficialSite: true }),
      row(10, 3, { hasOfficialSite: true, sharedNetworkId: 8 }),
      row(10, 3, { hasOfficialSite: true, sharedNetworkId: 8 }),
    ]);

    expect(await findHostStationIds(stationsAt(1))).toEqual(
      new Map([
        [1, 10],
        [2, 8],
      ]),
    );
  });

  it("leaves stations unmatched when holders belong to another location, network, or the same operator, or to no network", async () => {
    dbMock.enqueueFor("select", "stations", [
      row(1, 1),
      row(2, 2, { hasOfficialSite: true, locationId: 2 }),
      row(3, 2, { hasOfficialSite: true, sharedNetworkId: 8 }),
      row(4, 1, { hasOfficialSite: true }),
      row(5, 2, { hasOfficialSite: true, operatorId: null, sharedNetworkId: null }),
    ]);

    expect(await findHostStationIds(stationsAt(1, 2, 3))).toEqual(new Map());
  });

  it("matches straightforward host selection across varied locations, memberships, and duplicate rows", async () => {
    const rows: HostRow[] = [];
    for (let locationId = 1; locationId <= 5; locationId++) {
      for (let operatorId = 1; operatorId <= 4; operatorId++) {
        for (let member = 0; member < 2; member++) {
          const id = locationId * 100 + operatorId * 10 + member;
          for (const sharedNetworkId of [7, operatorId % 2 === 0 ? 8 : 9]) {
            const memberRow = row(id, operatorId, { locationId, sharedNetworkId, hasOfficialSite: member === 1 });
            rows.push(memberRow);
            if (operatorId === 2) rows.push({ ...memberRow });
          }
        }
      }
    }
    rows.sort((left, right) => left.id - right.id);
    dbMock.enqueueFor("select", "stations", rows);

    expect(await findHostStationIds(stationsAt(1, 2, 3, 4, 5, 5))).toEqual(referenceHosts(rows));
    expect(dbMock.calls).toHaveLength(1);
  });

  it("examines candidates linearly for a page of 1500 locations", async () => {
    const locationIds = Array.from({ length: 1500 }, (_, index) => index + 1);
    const rows = [
      ...locationIds.map((locationId) => row(locationId, 1, { locationId })),
      ...locationIds.map((locationId) => row(1500 + locationId, 2, { locationId, hasOfficialSite: true })),
    ];
    let candidateReads = 0;
    dbMock.enqueueFor(
      "select",
      "stations",
      rows.map((station) => ({
        ...station,
        get hasOfficialSite() {
          candidateReads++;
          return station.hasOfficialSite;
        },
      })),
    );

    expect(await findHostStationIds(stationsAt(...locationIds))).toEqual(new Map(locationIds.map((locationId) => [locationId, 1500 + locationId])));
    expect(candidateReads).toBeLessThanOrEqual(rows.length * 10);
    expect(dbMock.calls).toHaveLength(1);
  });

  it("reads only the stored host where the country lists no official sites", async () => {
    dbMock.enqueueFor("select", "stations", [
      row(1, 1, { countryCode: "GB", operatorId: null, sharedNetworkId: null }),
      row(2, 2, { countryCode: "GB", hasOfficialSite: true }),
      row(3, 1, { countryCode: "GB" }),
    ]);

    expect(
      await findHostStationIds([
        { id: 1, location_id: 1, ran_host_station_id: 2 },
        { id: 2, location_id: 1, ran_host_station_id: null },
        { id: 3, location_id: 1, ran_host_station_id: null },
      ]),
    ).toEqual(new Map([[1, 2]]));
  });

  it("reads only the computed host where the country lists official sites, whatever is stored", async () => {
    dbMock.enqueueFor("select", "stations", [
      row(1, 1),
      row(2, 2, { hasOfficialSite: true }),
      row(3, 3, { operatorId: null, sharedNetworkId: null }),
    ]);

    expect(
      await findHostStationIds([
        { id: 1, location_id: 1, ran_host_station_id: 3 },
        { id: 3, location_id: 1, ran_host_station_id: 2 },
      ]),
    ).toEqual(new Map([[1, 2]]));
  });

  it("decides per location when one page spans a country with official sites and one without", async () => {
    dbMock.enqueueFor("select", "stations", [
      row(1, 1),
      row(2, 2, { hasOfficialSite: true }),
      row(3, 1, { locationId: 2, countryCode: "GB" }),
      row(4, 2, { locationId: 2, countryCode: "GB", hasOfficialSite: true }),
    ]);

    expect(
      await findHostStationIds([
        { id: 1, location_id: 1, ran_host_station_id: null },
        { id: 3, location_id: 2, ran_host_station_id: null },
        { id: 4, location_id: 2, ran_host_station_id: 3 },
      ]),
    ).toEqual(
      new Map([
        [1, 2],
        [4, 3],
      ]),
    );
  });
});
