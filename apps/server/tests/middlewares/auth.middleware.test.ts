import type { FastifyContextConfig, FastifyRequest, LightMyRequestResponse } from "fastify";
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { type RuntimeSettingsPatch, getRuntimeSettings, mergeRuntimeSettings } from "../../src/lib/runtimeSettings.js";
import { authBoundary, dbMock, userSession } from "../helpers/boundaries.js";
import { createRouteHarness } from "../helpers/routeHarness.js";

const userId = userSession().user.id;
function settings(patch: RuntimeSettingsPatch): void {
  Object.assign(getRuntimeSettings(), mergeRuntimeSettings(getRuntimeSettings(), patch));
}
async function request(
  config: FastifyContextConfig = {},
  headers: Record<string, string> = {},
  url = "/guarded",
  routePattern = url,
): Promise<LightMyRequestResponse> {
  const app = await createRouteHarness(
    {
      url: routePattern,
      method: "GET",
      config,
      schema: { response: { 200: z.object({ data: z.object({ actor: z.string().nullable(), publishable: z.boolean() }) }) } },
      handler: (req: FastifyRequest, reply: { send: (payload: unknown) => unknown }) =>
        reply.send({
          data: {
            actor: req.userSession?.user.id ?? req.apiToken?.referenceId ?? null,
            publishable: req.publishableKey !== null,
          },
        }),
    },
    { runAuth: true },
  );
  return app.inject({ method: "GET", url, headers });
}
function expectFailure(response: LightMyRequestResponse, status: number, code: string): void {
  expect(response.statusCode).toBe(status);
  expect(response.json()).toMatchObject({ errors: [{ code }] });
}

describe("authHook", () => {
  it("allows an unauthenticated guest route", async () => {
    const response = await request({ allowGuestAccess: true });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.actor).toBeNull();
  });
  it("requires a session for a protected route", async () => {
    expectFailure(await request(), 401, "UNAUTHORIZED");
  });
  it("attaches a verified session to the handler", async () => {
    const session = userSession();
    authBoundary.getCurrentUser.mockResolvedValue(session);
    expect((await request()).json().data.actor).toBe(session.user.id);
  });
  it("allows static API documentation without looking up a session", async () => {
    expect((await request({}, {}, "/api/v2/openapi.json")).statusCode).toBe(200);
    expect(authBoundary.getCurrentUser).not.toHaveBeenCalled();
  });
  it.each(["/guarded", "/api/v2/openapi.json", "/uploads/photo.jpg", "/robots.txt"])("returns maintenance mode for guests on %s", async (url) => {
    settings({ maintenanceEnabled: true });
    const response = await request({ allowGuestAccess: true }, {}, url);
    expectFailure(response, 503, "MAINTENANCE_MODE");
    expect(response.headers["cache-control"]).toBe("no-store");
  });
  it.each(["user", "editor"] as const)("returns maintenance mode for a signed-in %s", async (role) => {
    settings({ maintenanceEnabled: true });
    authBoundary.getCurrentUser.mockResolvedValue(userSession(userId, role));
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    expectFailure(await request({ allowGuestAccess: true }), 503, "MAINTENANCE_MODE");
  });
  it.each(["/guarded", "/api/v2/openapi.json"])("allows an administrator to keep using %s during maintenance", async (url) => {
    settings({ maintenanceEnabled: true });
    authBoundary.getCurrentUser.mockResolvedValue(userSession(userId, "admin"));
    expect((await request({ allowGuestAccess: true }, {}, url)).statusCode).toBe(200);
    expect(authBoundary.getCurrentUser).toHaveBeenCalledOnce();
    expect(authBoundary.auth.api.userHasPermission).toHaveBeenCalledWith({ body: { userId, permissions: { settings: ["update"] } } });
  });
  it.each<Record<string, string>>([{ "x-api-key": "api-secret" }, { "x-api-key": "pk_secret" }, { authorization: "Bearer oat_secret" }])(
    "rejects token access during maintenance for %j",
    async (headers) => {
      settings({ maintenanceEnabled: true });
      authBoundary.getCurrentUser.mockResolvedValue(userSession(userId, "admin"));
      expectFailure(await request({ allowGuestAccess: true }, headers), 503, "MAINTENANCE_MODE");
      expect(authBoundary.verifyApiKey).not.toHaveBeenCalled();
      expect(dbMock.query.oauthAccessTokens.findFirst).not.toHaveBeenCalled();
    },
  );
  it.each(["/api/v1/health", "/api/v2/settings"])("keeps %s readable during maintenance", async (url) => {
    settings({ maintenanceEnabled: true, enforceAuthForAllRoutes: true });
    expect((await request({ allowGuestAccess: true }, {}, url)).statusCode).toBe(200);
  });
  it.each([
    "/api/v1/auth/sign-in/email",
    "/api/v1/auth/callback/google",
    "/api/v1/auth/get-session",
    "/api/v1/auth/sign-out",
    "/api/v1/auth/passkey/generate-authenticate-options",
    "/api/v1/auth/two-factor/verify-totp",
    "/api/v1/auth/request-password-reset",
    "/api/v1/auth/reset-password",
    "/api/v1/auth/reset-password/token",
    "/api/v1/auth/send-verification-email",
    "/api/v1/auth/verify-email",
  ])("keeps the authentication endpoint %s reachable during maintenance", async (url) => {
    settings({ maintenanceEnabled: true, enforceAuthForAllRoutes: true, allowedUnauthenticatedRoutes: [] });
    expect((await request({}, {}, url, "/api/v1/auth/*")).statusCode).toBe(200);
    expect(authBoundary.getCurrentUser).not.toHaveBeenCalled();
  });
  it("blocks new registrations during maintenance", async () => {
    settings({ maintenanceEnabled: true });
    expectFailure(await request({}, {}, "/api/v1/auth/sign-up/email", "/api/v1/auth/*"), 503, "MAINTENANCE_MODE");
  });
  it("restores guest access when maintenance mode is disabled", async () => {
    settings({ maintenanceEnabled: true });
    expectFailure(await request({ allowGuestAccess: true }), 503, "MAINTENANCE_MODE");
    settings({ maintenanceEnabled: false });
    expect((await request({ allowGuestAccess: true })).statusCode).toBe(200);
  });
  it("retains permission checks for administrators during maintenance", async () => {
    settings({ maintenanceEnabled: true });
    authBoundary.getCurrentUser.mockResolvedValue(userSession(userId, "admin"));
    authBoundary.auth.api.userHasPermission.mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: false });
    expectFailure(await request({ permissions: ["create:stations"] }), 403, "INSUFFICIENT_PERMISSIONS");
  });
  it.each(["/guarded", "/api/v2/openapi.json"])("applies site-wide authentication to %s", async (url) => {
    settings({ enforceAuthForAllRoutes: true });
    expectFailure(await request({ allowGuestAccess: true }, {}, url), 401, "UNAUTHORIZED");
  });
  it("allows an explicit guest exception while site-wide authentication is enabled", async () => {
    settings({ enforceAuthForAllRoutes: true, allowedUnauthenticatedRoutes: ["/guarded"] });
    expect((await request({ allowGuestAccess: true })).statusCode).toBe(200);
  });
  it("keeps protected routes authenticated even when configured as a guest exception", async () => {
    settings({ enforceAuthForAllRoutes: true, allowedUnauthenticatedRoutes: ["/guarded"] });
    expectFailure(await request(), 401, "UNAUTHORIZED");
  });
  it.each([false, true])("blocks a disabled route whether guest access is %s", async (allowGuestAccess) => {
    settings({ disabledRoutes: ["/guarded"] });
    authBoundary.getCurrentUser.mockResolvedValue(userSession());
    expectFailure(await request({ allowGuestAccess }), 403, "FORBIDDEN");
    expect(authBoundary.getCurrentUser).not.toHaveBeenCalled();
  });
  it("verifies every protected route permission against the session user", async () => {
    authBoundary.getCurrentUser.mockResolvedValue(userSession());
    expect((await request({ permissions: ["read:stations", "read:cells"] })).statusCode).toBe(200);
    expect(authBoundary.auth.api.userHasPermission).toHaveBeenCalledWith({
      body: { userId: userId, permissions: { stations: ["read"], cells: ["read"] } },
    });
  });
  it("rejects a session missing the required permission", async () => {
    authBoundary.getCurrentUser.mockResolvedValue(userSession());
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    expectFailure(await request({ permissions: ["create:stations"] }), 403, "INSUFFICIENT_PERMISSIONS");
  });
  it("does not require protected permissions to read a guest endpoint", async () => {
    authBoundary.getCurrentUser.mockResolvedValue(userSession());
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    expect((await request({ allowGuestAccess: true, permissions: ["read:stations"] })).statusCode).toBe(200);
    expect(authBoundary.auth.api.userHasPermission).not.toHaveBeenCalled();
  });
  it("requires two-factor setup before normal account access", async () => {
    const session = userSession();
    session.user.forceTotp = true;
    session.user.twoFactorEnabled = false;
    authBoundary.getCurrentUser.mockResolvedValue(session);
    expectFailure(await request(), 403, "TWO_FACTOR_REQUIRED");
  });
  it("accepts a user who has enabled required two-factor authentication", async () => {
    const session = userSession();
    session.user.forceTotp = true;
    session.user.twoFactorEnabled = true;
    authBoundary.getCurrentUser.mockResolvedValue(session);
    expect((await request()).statusCode).toBe(200);
  });
  it("keeps settings readable while two-factor setup is required", async () => {
    const session = userSession();
    session.user.forceTotp = true;
    authBoundary.getCurrentUser.mockResolvedValue(session);
    settings({ disabledRoutes: ["/api/v2/settings"] });
    expect((await request({}, {}, "/api/v2/settings")).statusCode).toBe(200);
  });
  it.each(["", " ", "\t"])("rejects an empty API key %j", async (key) => {
    expectFailure(await request({}, { "x-api-key": key }), 401, "UNAUTHORIZED");
  });
  it("trims an API key and requests all declared permissions", async () => {
    const key = { id: "key", referenceId: userId };
    authBoundary.verifyApiKey.mockResolvedValue({ valid: true, key });
    const response = await request({ permissions: ["read:stations"] }, { "x-api-key": " api-secret " });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.actor).toBe(key.referenceId);
    expect(authBoundary.verifyApiKey).toHaveBeenCalledWith("api-secret", { stations: ["read"] });
    expect(authBoundary.getCurrentUser).not.toHaveBeenCalled();
  });
  it.each([
    { valid: false, key: null },
    { valid: true, key: null },
  ])("rejects an invalid private key verification $valid/$key", async (verification) => {
    authBoundary.verifyApiKey.mockResolvedValue(verification);
    expectFailure(await request({}, { "x-api-key": "api-secret" }), 403, "FORBIDDEN");
  });
  it("gives the API key precedence over the session and bearer header", async () => {
    authBoundary.getCurrentUser.mockResolvedValue(userSession("session-user"));
    authBoundary.verifyApiKey.mockResolvedValue({ valid: true, key: { id: "key", referenceId: "api-user" } });
    expect((await request({}, { "x-api-key": "api-secret", authorization: "Bearer oat_ignored" })).json().data.actor).toBe("api-user");
    expect(dbMock.query.oauthAccessTokens.findFirst).not.toHaveBeenCalled();
  });
  it("allows a publishable key only for a guest endpoint", async () => {
    authBoundary.verifyApiKey.mockResolvedValue({
      valid: true,
      key: { id: "key", name: null, metadata: JSON.stringify({ type: "publishable", tier: "pro" }) },
    });
    const response = await request({ allowGuestAccess: true }, { "x-api-key": "pk_secret" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ actor: null, publishable: true });
  });
  it("rejects a publishable key on an account endpoint", async () => {
    authBoundary.verifyApiKey.mockResolvedValue({ valid: true, key: { id: "key", metadata: JSON.stringify({ type: "publishable" }) } });
    expectFailure(await request({}, { "x-api-key": "pk_secret" }), 401, "UNAUTHORIZED");
  });
  it.each([undefined, "invalid-json", JSON.stringify({ type: "private" })])("rejects malformed publishable key metadata %s", async (metadata) => {
    authBoundary.verifyApiKey.mockResolvedValue({ valid: true, key: { id: "key", metadata } });
    expectFailure(await request({ allowGuestAccess: true }, { "x-api-key": "pk_secret" }), 401, "UNAUTHORIZED");
  });
  it("rejects a publishable key when site-wide authentication overrides guest access", async () => {
    settings({ enforceAuthForAllRoutes: true });
    authBoundary.verifyApiKey.mockResolvedValue({ valid: true, key: { id: "key", metadata: JSON.stringify({ type: "publishable" }) } });
    expectFailure(await request({ allowGuestAccess: true }, { "x-api-key": "pk_secret" }), 401, "UNAUTHORIZED");
  });
  it.each(["Basic credentials", "Bearer ", "Bearer non-oauth-key"])("does not accept unsupported authorization %s", async (authorization) => {
    expectFailure(await request({}, { authorization }), 401, "UNAUTHORIZED");
    expect(dbMock.query.oauthAccessTokens.findFirst).not.toHaveBeenCalled();
  });
  it("rejects an unrecognized OAuth bearer token", async () => {
    dbMock.query.oauthAccessTokens.findFirst.mockResolvedValue(undefined);
    expectFailure(await request({}, { authorization: "Bearer oat_secret" }), 401, "UNAUTHORIZED");
  });
  it.each([
    { scopes: ["read:stations"], permitted: true, expected: 200 },
    { scopes: [], permitted: true, expected: 403 },
    { scopes: ["read:stations"], permitted: false, expected: 403 },
  ])("requires OAuth consent and current account permission $scopes/$permitted", async ({ scopes, permitted, expected }) => {
    dbMock.query.oauthAccessTokens.findFirst.mockResolvedValue({
      id: "token",
      clientId: "client",
      userId: userId,
      scopes,
      createdAt: new Date(),
      expiresAt: new Date("2099-01-01"),
      revoked: false,
      sessionId: null,
    });
    dbMock.query.users.findFirst.mockResolvedValue(userSession().user);
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: permitted });
    const response = await request({ permissions: ["read:stations"] }, { authorization: "Bearer oat_secret" });
    expect(response.statusCode).toBe(expected);
    if (expected === 200) expect(response.json().data.actor).toBe(userId);
    else expect(response.json().errors[0].code).toBe("INSUFFICIENT_PERMISSIONS");
  });
  it("requires two-factor setup for an otherwise valid OAuth token", async () => {
    dbMock.query.oauthAccessTokens.findFirst.mockResolvedValue({
      id: "token",
      clientId: "client",
      userId: userId,
      scopes: [],
      createdAt: new Date(),
      expiresAt: new Date("2099-01-01"),
      revoked: false,
    });
    dbMock.query.users.findFirst.mockResolvedValue({ ...userSession().user, forceTotp: true, twoFactorEnabled: false });
    expectFailure(await request({}, { authorization: "Bearer oat_secret" }), 403, "TWO_FACTOR_REQUIRED");
  });
  it("does not leak an authentication provider failure to the response", async () => {
    authBoundary.getCurrentUser.mockRejectedValue(new Error("provider connection contains a secret"));
    const response = await request();
    expectFailure(response, 500, "INTERNAL_SERVER_ERROR");
    expect(response.body).not.toContain("secret");
  });
});
