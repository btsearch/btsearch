import { stations } from "@openbts/drizzle";
import { describe, expect, it, vi } from "vitest";

import type { AuditEntryInput, AuditRecorder } from "../../../src/features/audit/types.js";
import { assertHostStationFits, clearBrokenHostLinks, clearGuestLinks, settleHostLinks } from "../../../src/features/stations/hostStations.js";
import type { DbTx } from "../../../src/types/global.js";
import { dbMock, queryOf } from "../../helpers/boundaries.js";
import { whereQuery } from "../../helpers/mutationAssertions.js";
import { stationRow } from "../../helpers/stationFixtures.js";

type HostLink = {
  id: number;
  locationId: number | null;
  operatorId: number | null;
  hostStationId: number | null;
  countryCode: string | null;
  longitude: number | null;
  latitude: number | null;
};

function link(id: number, overrides: Partial<HostLink> = {}): HostLink {
  return { id, locationId: 2, operatorId: id * 10, hostStationId: null, countryCode: "GB", longitude: 21, latitude: 52, ...overrides };
}

function recorder() {
  return {
    operationId: 9,
    tx: dbMock as unknown as DbTx,
    entryMetadata: { submission_id: "submission" },
    log: vi.fn(async (_entry: AuditEntryInput) => undefined),
    logMany: vi.fn(async (_entries: readonly AuditEntryInput[]) => undefined),
    withEntryMetadata: vi.fn(),
  };
}

function scriptHostWrite(rows: { id: number; before: number | null; after: number | null }[]) {
  dbMock.enqueueFor(
    "select",
    "stations",
    rows.map(({ id, before }) => stationRow({ id, ran_host_station_id: before })),
  );
  dbMock.enqueueFor(
    "update",
    "stations",
    rows.map(({ id, after }) => stationRow({ id, ran_host_station_id: after })),
  );
}

function hostWrites() {
  return dbMock.calls.filter((call) => call.operation === "update" && call.table === "stations").map((call) => call.values);
}

function placedIn(...countryCodes: (string | null)[]) {
  dbMock.enqueueFor("select", "stations", ...countryCodes.map((countryCode) => [{ locationCountry: countryCode, operatorCountry: countryCode }]));
}

function refusal(kind: string, message: string) {
  return { code: "BAD_REQUEST", message, details: [{ field: "station/hostStationId", kind }] };
}

const ELSEWHERE = refusal("hostElsewhere", "The host station must be at the same location as the station");
const COMPUTED = refusal("hostComputed", "Host stations in this country are worked out from the official sites and cannot be set");
const SAME_OPERATOR = refusal("hostSameOperator", "The host station must belong to another operator");
const HOSTED_HOST = refusal("hostIsHosted", "The host station has a host of its own");
const HOSTING_STATION = refusal("hostingStation", "A station that hosts other stations cannot get a host");

const station = link(1);
const host = link(2);

describe("assertHostStationFits", () => {
  it("reads nothing when no host is sent, and only the station's country when the host is removed", async () => {
    await assertHostStationFits({ stationId: 1, hostStationId: undefined, operatorId: undefined, location: undefined });
    expect(dbMock.select).not.toHaveBeenCalled();

    placedIn("GB");
    await assertHostStationFits({ stationId: 1, hostStationId: null, operatorId: undefined, location: undefined });
    expect(dbMock.calls.map((call) => Object.keys(Object(call.selection)))).toEqual([["locationCountry", "operatorCountry"]]);
  });

  it.each([2, null])("refuses host %s in a country that lists official sites", async (hostStationId) => {
    placedIn("PL");

    await expect(assertHostStationFits({ stationId: 1, hostStationId, operatorId: undefined, location: undefined })).rejects.toMatchObject(COMPUTED);
  });

  it("looks at the country a station moves to before its host", async () => {
    dbMock.enqueueHostLinks([station]);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL" }]);
    placedIn("GB");
    dbMock.enqueueFor("select", "locations", []);
    const location = { region_id: 7, longitude: 21.1, latitude: 52.1, move: "station" as const };

    await expect(assertHostStationFits({ stationId: 1, hostStationId: 2, operatorId: undefined, location })).rejects.toMatchObject(COMPUTED);
  });

  it("looks at the country of a new station before its host", async () => {
    dbMock.enqueueFor("select", "regions", [{ countryCode: "FR" }]);
    dbMock.enqueueFor("select", "operators", [{ countryCode: "FR" }]);
    dbMock.enqueueFor("select", "locations", []);
    const location = { region_id: 7, longitude: 2.35, latitude: 48.85 };

    await expect(assertHostStationFits({ stationId: null, hostStationId: 2, operatorId: 10, location })).rejects.toMatchObject(COMPUTED);
  });

  it.each([
    { reason: "it is the station itself", hostStationId: 1, links: [station], expected: refusal("hostSelf", "A station cannot host itself") },
    { reason: "it does not exist, as for a host elsewhere", hostStationId: 2, links: [station], expected: ELSEWHERE },
    { reason: "it is elsewhere", hostStationId: 2, links: [station, link(2, { locationId: 3 })], expected: ELSEWHERE },
    { reason: "it has the same operator", hostStationId: 2, links: [station, link(2, { operatorId: 10 })], expected: SAME_OPERATOR },
    { reason: "it has a host of its own", hostStationId: 2, links: [station, link(2, { hostStationId: 5 })], expected: HOSTED_HOST },
    { reason: "the station hosts others", hostStationId: 2, links: [station, host, link(3, { hostStationId: 1 })], expected: HOSTING_STATION },
  ])("refuses a host when $reason", async ({ hostStationId, links, expected }) => {
    dbMock.enqueueHostLinks(links);
    placedIn("GB");

    await expect(assertHostStationFits({ stationId: 1, hostStationId, operatorId: undefined, location: undefined })).rejects.toMatchObject(expected);
  });

  it("points the refusal at the path the caller gives", async () => {
    dbMock.enqueueHostLinks([station]);
    placedIn("GB");
    const request = { stationId: 1, hostStationId: 2, operatorId: undefined, location: undefined };

    await expect(assertHostStationFits(request, (path) => [3, ...path])).rejects.toMatchObject({
      details: [{ field: "3/station/hostStationId", kind: "hostElsewhere" }],
    });
  });

  it("accepts another operator's unhosted station at the same location", async () => {
    dbMock.enqueueHostLinks([station, host]);
    placedIn("GB");

    await expect(assertHostStationFits({ stationId: 1, hostStationId: 2, operatorId: undefined, location: undefined })).resolves.toBeUndefined();
  });

  it("checks the operator the station gets in the same change", async () => {
    dbMock.enqueueHostLinks([station, host]);
    placedIn("GB");
    dbMock.enqueueFor("select", "operators", [{ countryCode: "GB" }]);

    await expect(assertHostStationFits({ stationId: 1, hostStationId: 2, operatorId: 20, location: undefined })).rejects.toMatchObject(SAME_OPERATOR);
  });

  it("lets a station moving alone take a host at its new location and leave its guests behind", async () => {
    dbMock.enqueueHostLinks([station, link(2, { locationId: 5 }), link(3, { hostStationId: 1 })]);
    placedIn("GB");
    dbMock.enqueueFor("select", "locations", [{ id: 5 }]);

    await expect(
      assertHostStationFits({
        stationId: 1,
        hostStationId: 2,
        operatorId: undefined,
        location: { longitude: 21.1, latitude: 52.1, move: "station" },
      }),
    ).resolves.toBeUndefined();
  });

  it("keeps the guests of a station that moves with its whole location", async () => {
    dbMock.enqueueHostLinks([station, host, link(3, { hostStationId: 1 })]);
    placedIn("GB");
    dbMock.enqueueFor("select", "locations", []);

    await expect(
      assertHostStationFits({
        stationId: 1,
        hostStationId: 2,
        operatorId: undefined,
        location: { longitude: 21.1, latitude: 52.1, move: "location" },
      }),
    ).rejects.toMatchObject(HOSTING_STATION);
  });

  it("refuses a host at a place a moving station leaves, and a host in a country that lists official sites", async () => {
    dbMock.enqueueHostLinks([station, host], [station, link(2, { locationId: 5, countryCode: "FR" })]);
    placedIn("GB", "GB");
    dbMock.enqueueFor("select", "locations", [], [{ id: 5 }]);
    const location = { longitude: 21.1, latitude: 52.1, move: "station" as const };

    await expect(assertHostStationFits({ stationId: 1, hostStationId: 2, operatorId: undefined, location })).rejects.toMatchObject(ELSEWHERE);
    await expect(assertHostStationFits({ stationId: 1, hostStationId: 2, operatorId: undefined, location })).rejects.toMatchObject(COMPUTED);
  });

  it("refuses a host for a station sent without a location", async () => {
    dbMock.enqueueHostLinks([station, host]);
    placedIn("GB");

    await expect(assertHostStationFits({ stationId: 1, hostStationId: 2, operatorId: undefined, location: null })).rejects.toMatchObject(ELSEWHERE);
  });

  it("checks a new station against the location at its coordinates", async () => {
    dbMock.enqueueHostLinks([host], [host]);
    dbMock.enqueueFor("select", "operators", [{ countryCode: "GB" }], [{ countryCode: "GB" }]);
    dbMock.enqueueFor("select", "locations", [{ id: 2 }], []);
    const location = { longitude: 21, latitude: 52 };

    await expect(assertHostStationFits({ stationId: null, hostStationId: 2, operatorId: 10, location })).resolves.toBeUndefined();
    await expect(assertHostStationFits({ stationId: null, hostStationId: 2, operatorId: 10, location })).rejects.toMatchObject(ELSEWHERE);
  });
});

describe("settleHostLinks", () => {
  it("clears the station's host and its guests' links through the audit after it moved alone", async () => {
    const audit = recorder();
    dbMock.enqueueHostLinks([link(1, { locationId: 5, hostStationId: 2 }), host, link(3, { hostStationId: 1 })]);
    scriptHostWrite([
      { id: 3, before: 1, after: null },
      { id: 1, before: 2, after: null },
    ]);

    await settleHostLinks(audit as unknown as AuditRecorder, 1, undefined);

    expect(hostWrites()).toEqual([{ ran_host_station_id: null, updatedAt: expect.any(Date) }]);
    expect(audit.logMany).toHaveBeenCalledWith([
      expect.objectContaining({
        entity: "stations",
        op: "update",
        recordId: 3,
        stationId: 3,
        old: expect.objectContaining({ ran_host_station_id: 1 }),
        new: expect.objectContaining({ ran_host_station_id: null }),
        metadata: { submission_id: "submission" },
      }),
      expect.objectContaining({ recordId: 1, stationId: 1, new: expect.objectContaining({ ran_host_station_id: null }) }),
    ]);
  });

  it("clears only the links an operator change turned into one operator", async () => {
    const audit = recorder();
    dbMock.enqueueHostLinks([
      link(1, { operatorId: 20, hostStationId: 2 }),
      host,
      link(3, { hostStationId: 1 }),
      link(4, { operatorId: 20, hostStationId: 1 }),
    ]);
    scriptHostWrite([
      { id: 4, before: 1, after: null },
      { id: 1, before: 2, after: null },
    ]);

    await settleHostLinks(audit as unknown as AuditRecorder, 1, undefined);

    expect(audit.logMany.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ recordId: 4, stationId: 4 }),
      expect.objectContaining({ recordId: 1, stationId: 1 }),
    ]);
  });

  it.each([
    { role: "host", links: [link(1, { locationId: 5, hostStationId: 2 }), link(2, { locationId: 5 })] },
    {
      role: "guests",
      links: [link(1, { locationId: 5 }), link(3, { locationId: 5, hostStationId: 1 }), link(4, { locationId: 5, hostStationId: 1 })],
    },
  ])("keeps the station's $role when it moved with its whole location", async ({ links }) => {
    const audit = recorder();
    dbMock.enqueueHostLinks(links);

    await settleHostLinks(audit as unknown as AuditRecorder, 1, undefined);

    expect(hostWrites()).toEqual([]);
    expect(audit.logMany).not.toHaveBeenCalled();
  });

  it("checks a requested host again when the change is applied", async () => {
    const audit = recorder();
    const hosted = link(1, { hostStationId: 2 });
    dbMock.enqueueHostLinks([hosted, link(2, { locationId: 3 })], [hosted, link(2, { hostStationId: 6 })]);

    await expect(settleHostLinks(audit as unknown as AuditRecorder, 1, 2)).rejects.toMatchObject(ELSEWHERE);
    await expect(settleHostLinks(audit as unknown as AuditRecorder, 1, 2)).rejects.toMatchObject(HOSTED_HOST);
    expect(hostWrites()).toEqual([]);
  });

  it("refuses a requested host in a country that lists official sites when the change is applied", async () => {
    dbMock.enqueueHostLinks([link(1, { countryCode: "PL", hostStationId: 2 }), link(2, { countryCode: "PL" })]);

    await expect(settleHostLinks(recorder() as unknown as AuditRecorder, 1, 2)).rejects.toMatchObject(COMPUTED);
  });

  it("keeps a requested host that fits, reading the links under a row lock", async () => {
    const audit = recorder();
    dbMock.enqueueHostLinks([link(1, { hostStationId: 2 }), host]);

    await settleHostLinks(audit as unknown as AuditRecorder, 1, 2);

    expect(dbMock.calls[0]?.clauses.for).toEqual(["no key update", { of: stations }]);
    expect(hostWrites()).toEqual([]);
    expect(audit.logMany).not.toHaveBeenCalled();
  });
});

describe("clearBrokenHostLinks", () => {
  it("clears the reverted links to a host that moved away or got a host of its own, and the host of a station with guests", async () => {
    const audit = recorder();
    dbMock.enqueueHostLinks([
      link(1, { hostStationId: 2 }),
      link(2, { locationId: 3 }),
      link(5, { hostStationId: 6 }),
      link(6, { hostStationId: 8 }),
      link(7, { hostStationId: 9 }),
      link(9),
      link(10, { hostStationId: 7 }),
      link(11, { hostStationId: 9 }),
    ]);
    scriptHostWrite([
      { id: 1, before: 2, after: null },
      { id: 5, before: 6, after: null },
      { id: 7, before: 9, after: null },
    ]);

    await clearBrokenHostLinks(audit as unknown as AuditRecorder, [1, 5, 7]);

    expect(dbMock.calls[0]?.clauses.for).toEqual(["no key update", { of: stations }]);
    const clearingRead = dbMock.calls.find((call) => call.operation === "select" && call.table === "stations" && call.selection === undefined);
    expect(queryOf(clearingRead?.clauses.where?.[0]).params).toEqual([1, 5, 7]);
    expect(audit.logMany.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({ recordId: 1, new: expect.objectContaining({ ran_host_station_id: null }) }),
      expect.objectContaining({ recordId: 5, new: expect.objectContaining({ ran_host_station_id: null }) }),
      expect.objectContaining({ recordId: 7, new: expect.objectContaining({ ran_host_station_id: null }) }),
    ]);
  });

  it("reads nothing when no station was reverted", async () => {
    await clearBrokenHostLinks(recorder() as unknown as AuditRecorder, []);

    expect(dbMock.calls).toEqual([]);
  });
});

describe("clearGuestLinks", () => {
  it("clears the links of the stations that deleted stations hosted, leaving guests deleted with them", async () => {
    const audit = recorder();
    scriptHostWrite([{ id: 3, before: 1, after: null }]);

    await clearGuestLinks(audit as unknown as AuditRecorder, [1, 4]);

    expect(whereQuery("stations", "select").params).toEqual([1, 4, 1, 4]);
    expect(audit.logMany).toHaveBeenCalledWith([expect.objectContaining({ recordId: 3, stationId: 3 })]);
  });
});
