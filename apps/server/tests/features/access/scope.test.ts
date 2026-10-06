import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import {
  type ScopeRefs,
  assertRouteScope,
  defineScope,
  findLocationIdsAt,
  locationParamScope,
  locationRefs,
  requestCovers,
  requestOverlaps,
  requiresScope,
  resolveScopeTargets,
  stationParamScope,
} from "../../../src/features/access/scope.js";
import { dbMock, userSession } from "../../helpers/boundaries.js";

function request(role: Parameters<typeof userSession>[1] = "editor"): FastifyRequest {
  return {
    userSession: userSession(undefined, role),
    apiToken: null,
    routeOptions: { url: "/api/v2/stations/:id" },
  } as unknown as FastifyRequest;
}
function access(role = "editor", countryWide = false, regions: number[] = [1]): void {
  dbMock.enqueueFor("select", "users", [{ role }]);
  dbMock.enqueueFor(
    "select",
    "role_grants",
    role === "editor" ? regions.map((regionId) => ({ countryCode: "PL", grantRole: "editor", isCountryWide: countryWide, regionId })) : [],
  );
}

describe("requiresScope", () => {
  it.each([
    "create:stations",
    "update:stations",
    "delete:stations",
    "create:cells",
    "update:cells",
    "delete:cells",
    "create:locations",
    "update:locations",
    "delete:locations",
    "moderate:submissions",
  ] as const)("requires regional scope for %s", (permission) => expect(requiresScope([permission])).toBe(true));
  it("does not impose editor geography on read, reference, user-owned, or empty permissions", () => {
    expect(requiresScope(undefined)).toBe(false);
    expect(requiresScope([])).toBe(false);
    expect(requiresScope(["read:stations", "create:bands", "create:user_lists"])).toBe(false);
    expect(requiresScope(["read:stations", "delete:stations"])).toBe(true);
  });
});

describe("defineScope", () => {
  it("passes the validated route request to a typed scope resolver", async () => {
    const resolver = defineScope<{ Params: { id: number } }>((req) => ({ stationIds: [req.params.id] }));
    expect(await resolver({ params: { id: 9 } } as unknown as FastifyRequest)).toEqual({ stationIds: [9] });
  });
});

describe("stationParamScope", () => {
  it("binds the declared station parameter", async () =>
    expect(await stationParamScope({ params: { station_id: 9 } } as unknown as FastifyRequest)).toEqual({ stationIds: [9] }));
});
describe("locationParamScope", () => {
  it("binds the declared location parameter", async () =>
    expect(await locationParamScope({ params: { location_id: 8 } } as unknown as FastifyRequest)).toEqual({ locationIds: [8] }));
});

describe("locationRefs", () => {
  it.each([
    { proposed: undefined, current: undefined, expected: {} },
    { proposed: {}, current: undefined, expected: {} },
    { proposed: { region_id: null, longitude: null, latitude: null }, current: undefined, expected: {} },
    { proposed: { region_id: 1 }, current: undefined, expected: { regionIds: [1] } },
    { proposed: { longitude: 0 }, current: undefined, expected: {} },
    { proposed: { longitude: 0, latitude: 0 }, current: undefined, expected: { points: [{ longitude: 0, latitude: 0, regionId: undefined }] } },
    {
      proposed: { latitude: -10 },
      current: { region_id: 1, longitude: 20, latitude: 52 },
      expected: { points: [{ longitude: 20, latitude: -10, regionId: 1 }] },
    },
    {
      proposed: { region_id: 2 },
      current: { region_id: 1, longitude: 20, latitude: 52 },
      expected: { points: [{ longitude: 20, latitude: 52, regionId: 2 }] },
    },
  ])("resolves meaningful moved location fields $proposed with current $current", ({ proposed, current, expected }) =>
    expect(locationRefs(proposed, current)).toEqual(expected),
  );
});

describe("findLocationIdsAt", () => {
  it("skips coordinate queries for an empty collection", async () => {
    expect(await findLocationIdsAt([])).toEqual([]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });
  it("returns every existing location at the supplied coordinates", async () => {
    dbMock.enqueueFor("select", "locations", [{ id: 1 }, { id: 2 }]);
    expect(
      await findLocationIdsAt([
        { longitude: 0, latitude: -10 },
        { longitude: 20, latitude: 52 },
      ]),
    ).toEqual([1, 2]);
  });
});

describe("resolveScopeTargets", () => {
  it("does not query the database for empty refs or explicit targets", async () => {
    expect(await resolveScopeTargets({})).toEqual([]);
    expect(await resolveScopeTargets({ targets: [{ countryCode: "PL", regionId: 1 }] })).toEqual([{ countryCode: "PL", regionId: 1 }]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });
  it("resolves cells, shared photos, locations, stations, coordinate regions and detached station countries", async () => {
    dbMock.enqueueFor("select", "cells", [{ stationId: 10 }]);
    dbMock.enqueueFor("select", "location_photos", [{ locationId: 20 }]);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL", regionId: 30 }]);
    dbMock.enqueueFor("select", "locations", [{ countryCode: "PL", regionId: 40 }]);
    dbMock.enqueueFor("select", "stations", [{ countryCode: "DE", regionId: 50 }], [{ countryCode: "PL", regionId: 60 }]);
    dbMock.enqueue([{ regionId: 30 }]);
    const targets = await resolveScopeTargets({
      cellIds: [1, 1],
      locationPhotoIds: [2],
      detachedStationIds: [3],
      points: [{ longitude: 20, latitude: 52 }],
      targets: [{ countryCode: "FR", regionId: 70 }],
    });
    expect(targets).toEqual([
      { countryCode: "PL", regionId: 30 },
      { countryCode: "PL", regionId: 40 },
      { countryCode: "PL", regionId: 60 },
      { countryCode: "DE", regionId: null },
      { countryCode: "FR", regionId: 70 },
    ]);
  });
  it("resolves placed and unplaced station creation with operator country fallbacks", async () => {
    dbMock.enqueueFor("select", "operators", [{ id: 1, countryCode: "PL" }]);
    dbMock.enqueueFor("select", "locations", [{ countryCode: "DE", regionId: 2 }]);
    expect(
      await resolveScopeTargets({
        placements: [
          { locationId: 8, operatorId: 1 },
          { locationId: null, operatorId: 1 },
          { locationId: null, operatorId: null },
          { locationId: null, operatorId: 99 },
        ],
      }),
    ).toEqual([
      { countryCode: "DE", regionId: 2 },
      { countryCode: "PL", regionId: null },
      { countryCode: null, regionId: null },
      { countryCode: null, regionId: null },
    ]);
  });
  it("checks a changed operator country for detached stations and removed placements", async () => {
    dbMock.enqueueFor("select", "stations", [
      { id: 1, locationId: null, operatorId: 8 },
      { id: 2, locationId: 2, operatorId: 8 },
      { id: 3, locationId: 3, operatorId: 8 },
    ]);
    dbMock.enqueueFor("select", "operators", [
      { id: 8, countryCode: "PL" },
      { id: 9, countryCode: "DE" },
    ]);
    expect(
      await resolveScopeTargets({
        operatorChanges: [
          { stationId: 1, location: "kept" },
          { stationId: 2, operatorId: 9, location: "kept" },
          { stationId: 3, operatorId: 9, location: "removed" },
          { stationId: 99, operatorId: 9, location: "removed" },
        ],
      }),
    ).toEqual([
      { countryCode: "PL", regionId: null },
      { countryCode: "DE", regionId: null },
    ]);
  });
  it("includes all regions and parent stations changed by a submission", async () => {
    dbMock.enqueueFor("select", "submissions", [{ stationId: 10 }]);
    dbMock.enqueueFor(
      "select",
      "proposed_stations",
      [{ stationId: 11 }],
      [
        { type: "new", stationId: null, operatorId: 1 },
        { type: "update", stationId: 12, operatorId: 2 },
        { type: "update", stationId: null, operatorId: 3 },
      ],
    );
    dbMock.enqueueFor("select", "proposed_locations", [
      { region_id: 1, longitude: 20, latitude: 52, current: null },
      { region_id: 2, longitude: null, latitude: null, current: null },
    ]);
    dbMock.enqueueFor("select", "proposed_cells", [{ cellId: 5, stationId: 13, sectorId: 6 }]);
    dbMock.enqueueFor("select", "proposed_sectors", [{ sectorId: 7 }]);
    dbMock.enqueueFor("select", "submission_location_photo_selections", [{ locationPhotoId: 8 }]);
    dbMock.enqueueFor("select", "station_sectors", [{ stationId: 14 }]);
    dbMock.enqueueFor("select", "locations", [{ id: 20 }], [{ countryCode: "PL", regionId: 1 }]);
    dbMock.enqueueFor("select", "cells", [{ stationId: 15 }]);
    dbMock.enqueueFor("select", "location_photos", [{ locationId: 21 }]);
    dbMock.enqueue([{ regionId: 1 }]);
    dbMock.enqueueFor("select", "regions", [{ countryCode: "PL", regionId: 2 }]);
    dbMock.enqueueFor("select", "stations", [{ countryCode: "PL", regionId: 1 }], [{ id: 12, locationId: null, operatorId: 2 }]);
    dbMock.enqueueFor("select", "operators", [{ id: 1, countryCode: "PL" }], [{ id: 2, countryCode: "DE" }]);
    const targets = await resolveScopeTargets({ submissionIds: ["submission-id", "submission-id"] });
    expect(targets).toContainEqual({ countryCode: "PL", regionId: 2 });
    expect(targets).toContainEqual({ countryCode: "PL", regionId: 1 });
    expect(targets).toContainEqual({ countryCode: "PL", regionId: null });
    expect(targets).toContainEqual({ countryCode: "DE", regionId: null });
    expect(dbMock.pendingResults()).toBe(0);
  });
});

describe("requestCovers", () => {
  it.each([
    { refs: { targets: [{ countryCode: "PL", regionId: 1 }] }, expected: true },
    {
      refs: {
        targets: [
          { countryCode: "PL", regionId: 1 },
          { countryCode: "PL", regionId: 2 },
        ],
      },
      expected: false,
    },
    { refs: { targets: [{ countryCode: "DE", regionId: 1 }] }, expected: false },
    { refs: {}, expected: false },
  ])("requires editor coverage of every resolved target $refs", async ({ refs, expected }) => {
    access();
    expect(await requestCovers(request(), refs)).toBe(expected);
  });
  it("allows administrators without resolving all target records", async () => {
    access("admin");
    expect(await requestCovers(request("admin"), { stationIds: [999] })).toBe(true);
    expect(dbMock.calls).toHaveLength(2);
  });
  it("denies guests and editors without grants", async () => {
    expect(await requestCovers({ userSession: null, apiToken: null } as unknown as FastifyRequest, {})).toBe(false);
    access("editor", false, []);
    expect(await requestCovers(request(), { targets: [{ countryCode: "PL", regionId: 1 }] })).toBe(false);
  });
});

describe("requestOverlaps", () => {
  it("accepts one covered target among uncovered regions", async () => {
    access();
    expect(
      await requestOverlaps(request(), {
        targets: [
          { countryCode: "PL", regionId: 1 },
          { countryCode: "DE", regionId: 2 },
        ],
      }),
    ).toBe(true);
  });
  it("rejects empty or wholly uncovered targets", async () => {
    access();
    expect(await requestOverlaps(request(), {})).toBe(false);
    access();
    expect(await requestOverlaps(request(), { targets: [{ countryCode: "PL", regionId: 9 }] })).toBe(false);
  });
  it("denies guests and editors without grants while administrators overlap all targets", async () => {
    expect(await requestOverlaps({ userSession: null, apiToken: null } as unknown as FastifyRequest, {})).toBe(false);
    access("editor", false, []);
    expect(await requestOverlaps(request(), {})).toBe(false);
    access("admin");
    expect(await requestOverlaps(request("admin"), {})).toBe(true);
  });
});

describe("assertRouteScope", () => {
  it("rejects requests without a verified actor", async () => {
    await expect(assertRouteScope({ userSession: null, apiToken: null } as unknown as FastifyRequest, () => ({}))).rejects.toMatchObject({
      code: "INSUFFICIENT_PERMISSIONS",
    });
  });
  it("allows administrators without calling the resolver", async () => {
    access("admin");
    const resolver = vi.fn(() => ({}));
    await expect(assertRouteScope(request("admin"), resolver)).resolves.toBeUndefined();
    expect(resolver).not.toHaveBeenCalled();
  });
  it.each([
    { refs: { targets: [{ countryCode: "PL", regionId: 1 }] }, allowed: true },
    { refs: { targets: [{ countryCode: "PL", regionId: 2 }] }, allowed: false },
    { refs: { targets: [{ countryCode: "DE", regionId: 1 }] }, allowed: false },
    { refs: {}, allowed: false },
  ])("checks every editor write target $refs", async ({ refs, allowed }) => {
    access();
    const outcome = assertRouteScope(request(), () => refs as ScopeRefs);
    if (allowed) await expect(outcome).resolves.toBeUndefined();
    else await expect(outcome).rejects.toMatchObject({ code: "INSUFFICIENT_PERMISSIONS", message: "Your editor access does not cover this region" });
  });
});
