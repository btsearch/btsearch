import { beforeEach, describe, expect, it } from "vitest";

import { recordRoutePattern } from "../../../../src/features/settings/routeRules.js";
import { getRuntimeSettings } from "../../../../src/lib/runtimeSettings.js";
import route from "../../../../src/routes/v2/(patch)/settings.js";
import { authBoundary, dbMock, redisMock, userSession } from "../../../helpers/boundaries.js";
import { expectError, injectMutation, scriptAudit } from "../../../helpers/mutationAssertions.js";
import { createRouteHarness } from "../../../helpers/routeHarness.js";

const request = { method: "PATCH" as const, url: "/settings", payload: { features: { comments: true } } };
const options = { session: userSession("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "admin") };

describe("PATCH /settings", () => {
  beforeEach(() => {
    for (const pattern of ["/api/v1/auth/*", "/api/v2/settings", "/api/v2/stations", "/api/v1/submissions/cleanup"]) recordRoutePattern(pattern);
  });
  it.each([true, false])("lets administrators set maintenance mode to %s and records the change", async (enabled) => {
    getRuntimeSettings().maintenanceEnabled = !enabled;
    const before = structuredClone(getRuntimeSettings());
    authBoundary.getCurrentUser.mockResolvedValue(options.session);
    scriptAudit();
    const app = await createRouteHarness(route, { runAuth: true, prefix: "/api/v2" });
    const response = await app.inject({ method: "PATCH", url: "/api/v2/settings", payload: { isMaintenanceMode: enabled } });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.isMaintenanceMode).toBe(enabled);
    expect(getRuntimeSettings()).toEqual({ ...before, maintenanceEnabled: enabled });
    expect(redisMock.multi).toHaveBeenCalledOnce();
    expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toEqual(
      expect.arrayContaining([expect.objectContaining({ old_values: before, new_values: { ...before, maintenanceEnabled: enabled } })]),
    );
  });
  it("prevents guests from disabling maintenance mode", async () => {
    getRuntimeSettings().maintenanceEnabled = true;
    const app = await createRouteHarness(route, { runAuth: true, prefix: "/api/v2" });
    expectError(await app.inject({ method: "PATCH", url: "/api/v2/settings", payload: { isMaintenanceMode: false } }), 401, "UNAUTHORIZED");
    expect(getRuntimeSettings().maintenanceEnabled).toBe(true);
    expect(redisMock.multi).not.toHaveBeenCalled();
  });
  it("prevents a user without settings permission from disabling maintenance mode", async () => {
    getRuntimeSettings().maintenanceEnabled = true;
    authBoundary.getCurrentUser.mockResolvedValue(userSession());
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    const app = await createRouteHarness(route, { runAuth: true, prefix: "/api/v2" });
    expectError(
      await app.inject({ method: "PATCH", url: "/api/v2/settings", payload: { isMaintenanceMode: false } }),
      403,
      "INSUFFICIENT_PERMISSIONS",
    );
    expect(getRuntimeSettings().maintenanceEnabled).toBe(true);
    expect(redisMock.multi).not.toHaveBeenCalled();
  });

  it.each(["/api/v1/analyzer", "/api/v1/analyzer/apply", "/api/v1/settings", "/api/v1/submissions/batch"])(
    "removes a stored rule for the removed route %s when settings are saved",
    async (removed) => {
      Object.assign(getRuntimeSettings(), {
        allowedUnauthenticatedRoutes: ["/api/v1/auth", removed],
        disabledRoutes: ["/api/v2/stations", removed],
      });
      const before = structuredClone(getRuntimeSettings());
      scriptAudit();
      const response = await injectMutation(
        route,
        { ...request, payload: { access: { openRoutes: before.allowedUnauthenticatedRoutes, disabledRoutes: before.disabledRoutes } } },
        options,
      );
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        data: { access: { openRoutes: ["/api/v1/auth"], disabledRoutes: ["/api/v2/stations"] } },
      });
      expect(getRuntimeSettings()).toMatchObject({
        allowedUnauthenticatedRoutes: ["/api/v1/auth"],
        disabledRoutes: ["/api/v2/stations"],
      });
      expect(redisMock.multi).toHaveBeenCalledOnce();
      expect(dbMock.calls.find((call) => call.operation === "insert" && call.table === "audit_logs")?.values).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entity: "settings",
            old_values: before,
            new_values: expect.objectContaining({
              allowedUnauthenticatedRoutes: ["/api/v1/auth"],
              disabledRoutes: ["/api/v2/stations"],
            }),
          }),
        ]),
      );
    },
  );

  it("audits stale rule cleanup even when the supplied feature setting is unchanged", async () => {
    Object.assign(getRuntimeSettings(), {
      allowedUnauthenticatedRoutes: ["/api/v1/submissions", "/api/v1/settings"],
      disabledRoutes: ["/api/v1/analyzer"],
    });
    const before = structuredClone(getRuntimeSettings());
    scriptAudit();
    const response = await injectMutation(route, { ...request, payload: { features: { comments: false } } }, options);
    expect(response.statusCode).toBe(200);
    expect(getRuntimeSettings()).toMatchObject({
      allowedUnauthenticatedRoutes: ["/api/v1/submissions"],
      disabledRoutes: [],
    });
    const audits = dbMock.calls.filter((call) => call.operation === "insert" && call.table === "audit_logs");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.values).toEqual(expect.arrayContaining([expect.objectContaining({ old_values: before, new_values: getRuntimeSettings() })]));
    expect(redisMock.multi).toHaveBeenCalledOnce();
  });

  it("rechecks a stored removed rule against the settings loaded under the lock", async () => {
    const removed = "/api/v1/analyzer";
    Object.assign(getRuntimeSettings(), { disabledRoutes: [removed] });
    const latest = structuredClone(getRuntimeSettings());
    latest.disabledRoutes = [];
    redisMock.get.mockResolvedValueOnce(JSON.stringify(latest));
    expectError(
      await injectMutation(route, { ...request, payload: { access: { disabledRoutes: [removed] } } }, options),
      400,
      "BAD_REQUEST",
      `No route starts with "${removed}"`,
    );
    expect(redisMock.set).toHaveBeenCalledOnce();
    expect(redisMock.eval).toHaveBeenCalledOnce();
    expect(redisMock.multi).not.toHaveBeenCalled();
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("rejects moving an unmatched stored rule into a different access list", async () => {
    Object.assign(getRuntimeSettings(), { allowedUnauthenticatedRoutes: ["/api/v1/analyzer"] });
    expectError(
      await injectMutation(route, { ...request, payload: { access: { disabledRoutes: ["/api/v1/analyzer"] } } }, options),
      400,
      "BAD_REQUEST",
      'No route starts with "/api/v1/analyzer"',
    );
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it("updates supplied settings while retaining omitted features and banner fields", async () => {
    const before = structuredClone(getRuntimeSettings());
    scriptAudit();
    const response = await injectMutation(route, request, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        features: { comments: true, submissions: before.submissionsEnabled, photoUploads: before.photosEnabled },
        access: { openRoutes: before.allowedUnauthenticatedRoutes, disabledRoutes: before.disabledRoutes },
      },
    });
    expect(getRuntimeSettings()).toMatchObject({
      enableStationComments: true,
      submissionsEnabled: before.submissionsEnabled,
      announcement: before.announcement,
    });
    expect(redisMock.multi).toHaveBeenCalledOnce();
    expect(redisMock.eval).toHaveBeenCalledOnce();
  });

  it.each(["structureOwnerProposals", "psc", "bsic"])("rejects updating country-scoped feature %s through global settings", async (feature) => {
    const response = await injectMutation(route, { ...request, payload: { features: { [feature]: true } } }, options);
    expectError(response, 400, "VALIDATION_ERROR");
    expect(redisMock.multi).not.toHaveBeenCalled();
    expect(dbMock.transaction).not.toHaveBeenCalled();
  });

  it("does not audit or persist a patch that changes no setting", async () => {
    const response = await injectMutation(route, { ...request, payload: { features: { comments: false } } }, options);
    expect(response.statusCode).toBe(200);
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(redisMock.multi).not.toHaveBeenCalled();
    expect(redisMock.eval).toHaveBeenCalledOnce();
  });

  it("fails with 409 while another settings save owns the lock", async () => {
    redisMock.set.mockResolvedValue(null);
    expectError(await injectMutation(route, request, options), 409, "CONFLICT", "Another change to the settings is being saved, try again");
    expect(dbMock.transaction).not.toHaveBeenCalled();
    expect(redisMock.eval).not.toHaveBeenCalled();
  });

  it.each(["openRoutes", "disabledRoutes"])("rejects new %s rules that do not match an existing route", async (list) => {
    expectError(
      await injectMutation(route, { ...request, payload: { access: { [list]: ["/api/v2/missing-route-unique"] } } }, options),
      400,
      "BAD_REQUEST",
      'No route starts with "/api/v2/missing-route-unique"',
    );
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it.each(["/api/v2/settings", "/api/v1/auth/sign-in"])("prevents disabling the protected route prefix %s", async (prefix) => {
    recordRoutePattern(prefix === "/api/v2/settings" ? prefix : "/api/v1/auth/*");
    expectError(
      await injectMutation(route, { ...request, payload: { access: { disabledRoutes: [prefix] } } }, options),
      400,
      "BAD_REQUEST",
      `"${prefix}" would disable the sign-in routes, the settings routes or the health check`,
    );
  });

  it("replaces a supplied route list and leaves the other list unchanged", async () => {
    recordRoutePattern("/api/v2/stations");
    scriptAudit();
    const response = await injectMutation(route, { ...request, payload: { access: { openRoutes: ["/api/v2/stations"] } } }, options);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { access: { openRoutes: ["/api/v2/stations"], disabledRoutes: [] } } });
  });

  it("releases the settings lock after persistence fails", async () => {
    scriptAudit();
    redisMock.multi.mockImplementation(() => {
      throw new Error("Redis unavailable");
    });
    expectError(await injectMutation(route, request, options), 500, "FAILED_TO_UPDATE");
    expect(redisMock.eval).toHaveBeenCalledOnce();
    expect(getRuntimeSettings().enableStationComments).toBe(false);
  });

  it.each([
    {},
    { features: {} },
    { announcement: {} },
    { access: {} },
    { isMaintenanceMode: "true" },
    { features: { unsupported: true } },
    { announcement: { message: "x".repeat(1001) } },
    { access: { openRoutes: ["/"] } },
    { access: { disabledRoutes: Array.from({ length: 101 }, () => "/api/v2/stations") } },
  ])("rejects invalid settings input %j", async (payload) => {
    expectError(await injectMutation(route, { ...request, payload }, options), 400, "VALIDATION_ERROR");
    expect(redisMock.set).not.toHaveBeenCalled();
  });
});
