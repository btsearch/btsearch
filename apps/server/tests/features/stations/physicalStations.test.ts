import { describe, expect, it } from "vitest";

import { findHostStationIds } from "../../../src/features/stations/physicalStations.js";
import { dbMock } from "../../helpers/boundaries.js";

type HostRow = {
  id: number;
  locationId: number | null;
  operatorId: number;
  sharedNetworkId: number;
  hasPermits: boolean;
};

function row(id: number, operatorId: number, overrides: Partial<HostRow> = {}): HostRow {
  return { id, operatorId, locationId: 1, sharedNetworkId: 7, hasPermits: false, ...overrides };
}

function referenceHosts(rows: readonly HostRow[]): Map<number, number> {
  const hosts = new Map<number, number>();
  for (const station of rows) {
    if (station.hasPermits || hosts.has(station.id)) continue;
    const host = rows.find(
      (candidate) =>
        candidate.hasPermits &&
        candidate.locationId === station.locationId &&
        candidate.sharedNetworkId === station.sharedNetworkId &&
        candidate.operatorId !== station.operatorId,
    );
    if (host !== undefined) hosts.set(station.id, host.id);
  }
  return hosts;
}

describe("findHostStationIds", () => {
  it("avoids a query when no locations are requested", async () => {
    expect(await findHostStationIds([])).toEqual(new Map());
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("keeps the first eligible host in query order, including inactive holders and several operators", async () => {
    dbMock.enqueueFor("select", "stations", [
      row(100, 10, { hasPermits: true }),
      row(101, 20, { hasPermits: true }),
      row(102, 30, { hasPermits: true }),
      row(199, 10),
      row(200, 20),
      row(201, 30),
      row(1, 20, { hasPermits: true }),
    ]);

    expect(await findHostStationIds([1])).toEqual(
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
      row(5, 2, { hasPermits: true, sharedNetworkId: 9 }),
      row(8, 1, { hasPermits: true }),
      row(10, 3, { hasPermits: true, sharedNetworkId: 8 }),
      row(10, 3, { hasPermits: true, sharedNetworkId: 8 }),
    ]);

    expect(await findHostStationIds([1])).toEqual(
      new Map([
        [1, 10],
        [2, 8],
      ]),
    );
  });

  it("leaves stations unmatched when holders belong to another location, network, or the same operator", async () => {
    dbMock.enqueueFor("select", "stations", [
      row(1, 1),
      row(2, 2, { hasPermits: true, locationId: 2 }),
      row(3, 2, { hasPermits: true, sharedNetworkId: 8 }),
      row(4, 1, { hasPermits: true }),
    ]);

    expect(await findHostStationIds([1, 2, 3])).toEqual(new Map());
  });

  it("matches straightforward host selection across varied locations, memberships, and duplicate rows", async () => {
    const rows: HostRow[] = [];
    for (let locationId = 1; locationId <= 5; locationId++) {
      for (let operatorId = 1; operatorId <= 4; operatorId++) {
        for (let member = 0; member < 2; member++) {
          const id = locationId * 100 + operatorId * 10 + member;
          for (const sharedNetworkId of [7, operatorId % 2 === 0 ? 8 : 9]) {
            const memberRow = row(id, operatorId, { locationId, sharedNetworkId, hasPermits: member === 1 });
            rows.push(memberRow);
            if (operatorId === 2) rows.push({ ...memberRow });
          }
        }
      }
    }
    rows.sort((left, right) => left.id - right.id);
    dbMock.enqueueFor("select", "stations", rows);

    expect(await findHostStationIds([1, 2, 3, 4, 5, 5])).toEqual(referenceHosts(rows));
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it("examines candidates linearly for a page of 1500 locations", async () => {
    const locationIds = Array.from({ length: 1500 }, (_, index) => index + 1);
    const rows = [
      ...locationIds.map((locationId) => row(locationId, 1, { locationId })),
      ...locationIds.map((locationId) => row(1500 + locationId, 2, { locationId, hasPermits: true })),
    ];
    let candidateReads = 0;
    dbMock.enqueueFor(
      "select",
      "stations",
      rows.map((station) => ({
        ...station,
        get hasPermits() {
          candidateReads++;
          return station.hasPermits;
        },
      })),
    );

    expect(await findHostStationIds(locationIds)).toEqual(new Map(locationIds.map((locationId) => [locationId, 1500 + locationId])));
    expect(candidateReads).toBeLessThanOrEqual(rows.length * 10);
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it("propagates a failed host lookup", async () => {
    dbMock.enqueueFor("select", "stations", new Error("Host lookup failed"));

    await expect(findHostStationIds([1])).rejects.toThrow("Host lookup failed");
  });
});
