import type { FastifyRequest } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { assertObservationsOn, assertPublicObservationsOn, ownDataUserId } from "../../../src/features/observed/access.js";
import { getRuntimeSettings, mergeRuntimeSettings } from "../../../src/lib/runtimeSettings.js";
import { adminRole, editorRole, userRole } from "../../../src/plugins/auth/permissions.js";
import { authBoundary, userSession } from "../../helpers/boundaries.js";

const ROLES = { user: userRole, editor: editorRole, admin: adminRole };

type Role = keyof typeof ROLES;

function setObservations(isEnabled: boolean): void {
  Object.assign(getRuntimeSettings(), mergeRuntimeSettings(getRuntimeSettings(), { observationsEnabled: isEnabled }));
}

function request(role: Role | null): FastifyRequest {
  authBoundary.auth.api.userHasPermission.mockImplementation(async (input) => {
    const { permissions } = (input as { body: { permissions: Parameters<typeof adminRole.authorize>[0] } }).body;
    return role === null ? { success: false } : ROLES[role].authorize(permissions);
  });
  return { userSession: role === null ? null : userSession(undefined, role), oauthToken: null } as unknown as FastifyRequest;
}

describe("assertObservationsOn", () => {
  it("lets guests through while observations are on", async () => {
    await expect(assertObservationsOn(request(null))).resolves.toBeUndefined();
  });

  it("keeps the observed reads to administrators while it is off", async () => {
    setObservations(false);
    await expect(assertObservationsOn(request(null))).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    await expect(assertObservationsOn(request("editor"))).rejects.toMatchObject({ code: "FEATURE_DISABLED" });
    await expect(assertObservationsOn(request("admin"))).resolves.toBeUndefined();
  });
});

describe("ownDataUserId", () => {
  const session = userSession();
  const asCaller = (caller: object) => ({ userSession: session, apiToken: null, oauthToken: null, ...caller }) as unknown as FastifyRequest;

  it("is the signed-in person for a session and for the BTSearch app's token", () => {
    vi.stubEnv("APP_OAUTH_CLIENT_IDS", "btsearch-app");
    expect(ownDataUserId(asCaller({}))).toBe(session.user.id);
    expect(ownDataUserId(asCaller({ oauthToken: { clientId: "btsearch-app" } }))).toBe(session.user.id);
  });

  it("is no one for a guest, an API key and another application's token", () => {
    vi.stubEnv("APP_OAUTH_CLIENT_IDS", "btsearch-app");
    expect(ownDataUserId(asCaller({ userSession: null }))).toBeNull();
    expect(ownDataUserId(asCaller({ apiToken: { referenceId: session.user.id } }))).toBeNull();
    expect(ownDataUserId(asCaller({ oauthToken: { clientId: "a-map-viewer" } }))).toBeNull();
  });
});

describe("assertPublicObservationsOn", () => {
  it("lets everyone through while observations are on", () => {
    expect(() => assertPublicObservationsOn()).not.toThrow();
  });

  it("stops everyone while it is off, because one cached tile serves every caller", () => {
    setObservations(false);
    expect(() => assertPublicObservationsOn()).toThrow(expect.objectContaining({ code: "FEATURE_DISABLED" }));
  });
});
