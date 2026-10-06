import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";

import {
  type ActorAccess,
  type EditorGrant,
  accessFromRequest,
  actorIdFromRequest,
  canSeeCountry,
  coversTarget,
  loadStaffAccess,
} from "../../../src/features/access/access.js";
import { dbMock, userSession } from "../../helpers/boundaries.js";

const regional: EditorGrant = { countryCode: "PL", regionIds: [1, 2], isCountryWide: false, isMaintainer: false };
const userId = userSession().user.id;
function request(session = userSession(), apiToken: unknown = null): FastifyRequest {
  return { userSession: session, apiToken } as unknown as FastifyRequest;
}
function actor(role: string, grants: EditorGrant[] = [regional]): ActorAccess {
  return { userId: "user", role, grants };
}

describe("actorIdFromRequest", () => {
  it("prefers the authenticated session actor", () => expect(actorIdFromRequest(request(userSession(), { referenceId: "api-user" }))).toBe(userId));
  it("reads the API-key owner when no session exists", () =>
    expect(actorIdFromRequest({ userSession: null, apiToken: { referenceId: "api-user" } } as unknown as FastifyRequest)).toBe("api-user"));
  it("returns no actor for a guest or publishable key", () =>
    expect(actorIdFromRequest({ userSession: null, apiToken: null, publishableKey: { id: "public" } } as unknown as FastifyRequest)).toBeNull());
});

describe("accessFromRequest", () => {
  it("caches concurrent access lookups within the same request", async () => {
    dbMock.enqueueFor("select", "users", [{ role: "editor" }]);
    dbMock.enqueueFor("select", "role_grants", [
      { countryCode: "PL", grantRole: "editor", isCountryWide: false, regionId: 1 },
      { countryCode: "PL", grantRole: "maintainer", isCountryWide: true, regionId: null },
      { countryCode: "DE", grantRole: "editor", isCountryWide: false, regionId: 2 },
    ]);
    const req = request();
    const first = accessFromRequest(req);
    expect(accessFromRequest(req)).toBe(first);
    expect(await first).toEqual({
      userId: userId,
      role: "editor",
      grants: [
        { countryCode: "PL", isCountryWide: true, isMaintainer: true, regionIds: [1] },
        { countryCode: "DE", isCountryWide: false, isMaintainer: false, regionIds: [2] },
      ],
    });
    expect(dbMock.calls).toHaveLength(2);
  });
  it.each(["admin", "user"])("uses the current stored %s role instead of stale session grants", async (role) => {
    dbMock.enqueueFor("select", "users", [{ role }]);
    dbMock.enqueueFor("select", "role_grants", [{ countryCode: "PL", grantRole: "maintainer", isCountryWide: true, regionId: null }]);
    expect(await accessFromRequest(request(userSession(undefined, "editor")))).toEqual({ userId: userId, role, grants: [] });
  });
  it("does not share access lookups between different requests", async () => {
    dbMock.enqueueFor("select", "users", [{ role: "admin" }], [{ role: "user" }]);
    dbMock.enqueueFor("select", "role_grants", [], []);
    expect((await accessFromRequest(request()))?.role).toBe("admin");
    expect((await accessFromRequest(request()))?.role).toBe("user");
    expect(dbMock.calls).toHaveLength(4);
  });
  it("rejects access for a deleted account", async () => {
    dbMock.enqueueFor("select", "users", []);
    dbMock.enqueueFor("select", "role_grants", []);
    expect(await accessFromRequest(request())).toBeNull();
  });
  it("does not query grants for a guest", async () => {
    expect(await accessFromRequest({ userSession: null, apiToken: null } as unknown as FastifyRequest)).toBeNull();
    expect(dbMock.select).not.toHaveBeenCalled();
  });
  it("propagates a failed access database lookup", async () => {
    const failure = new Error("access database unavailable");
    dbMock.enqueueFor("select", "users", failure);
    dbMock.enqueueFor("select", "role_grants", []);
    await expect(accessFromRequest(request())).rejects.toBe(failure);
  });
});

describe("loadStaffAccess", () => {
  it("groups staff grants by user and country without granting scope to regular users", async () => {
    dbMock.enqueueFor("select", "users", [
      { userId: "admin", role: "admin", countryCode: null, grantRole: null, isCountryWide: null, regionId: null },
      { userId: "editor", role: "editor", countryCode: "PL", grantRole: "editor", isCountryWide: false, regionId: 1 },
      { userId: "editor", role: "editor", countryCode: "PL", grantRole: "maintainer", isCountryWide: true, regionId: null },
      { userId: "unassigned", role: "editor", countryCode: null, grantRole: null, isCountryWide: null, regionId: null },
    ]);
    expect(await loadStaffAccess()).toEqual([
      { userId: "admin", role: "admin", grants: [] },
      { userId: "editor", role: "editor", grants: [{ countryCode: "PL", isCountryWide: true, isMaintainer: true, regionIds: [1] }] },
      { userId: "unassigned", role: "editor", grants: [] },
    ]);
  });
  it("returns an empty collection when no staff exist", async () => {
    dbMock.enqueueFor("select", "users", []);
    expect(await loadStaffAccess()).toEqual([]);
  });
});

describe("coversTarget", () => {
  it.each([
    { access: actor("admin", []), target: { countryCode: null, regionId: null }, expected: true },
    { access: actor("editor"), target: { countryCode: "PL", regionId: 1 }, expected: true },
    { access: actor("editor"), target: { countryCode: "PL", regionId: 3 }, expected: false },
    { access: actor("editor"), target: { countryCode: "DE", regionId: 1 }, expected: false },
    { access: actor("editor"), target: { countryCode: null, regionId: 1 }, expected: false },
    { access: actor("editor"), target: { countryCode: "PL", regionId: null }, expected: false },
    { access: actor("editor", []), target: { countryCode: "PL", regionId: 1 }, expected: false },
    { access: actor("editor", [{ ...regional, isCountryWide: true }]), target: { countryCode: "PL", regionId: null }, expected: true },
    { access: actor("editor", [{ ...regional, isCountryWide: true }]), target: { countryCode: "DE", regionId: null }, expected: false },
  ])("checks country and region scope for $access.role/$target/$expected", ({ access, target, expected }) =>
    expect(coversTarget(access, target)).toBe(expected),
  );
});

describe("canSeeCountry", () => {
  it.each([
    { access: null, code: "PL", expected: false },
    { access: actor("admin", []), code: "DE", expected: true },
    { access: actor("editor"), code: "PL", expected: true },
    { access: actor("editor"), code: "DE", expected: false },
    { access: actor("user", []), code: "PL", expected: false },
  ])("limits country visibility for $access/$code", ({ access, code, expected }) => expect(canSeeCountry(access, code)).toBe(expected));
});
