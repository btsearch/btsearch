import { beforeEach, describe, expect, it } from "vitest";

import { recordRoutePattern } from "../../../../src/features/settings/routeRules.js";
import { getRuntimeSettings } from "../../../../src/lib/runtimeSettings.js";
import getSettings from "../../../../src/routes/v2/(get)/settings.js";
import { authBoundary, redisMock, userSession } from "../../../helpers/boundaries.js";
import { readUserId } from "../../../helpers/readFixtures.js";
import { createRouteHarness } from "../../../helpers/routeHarness.js";

describe("getSettings", () => {
  beforeEach(() => {
    recordRoutePattern("/api/v2/settings");
    recordRoutePattern("/api/v2/stations");
  });

  it("omits stored rules for removed routes without writing settings on a read", async () => {
    Object.assign(getRuntimeSettings(), {
      allowedUnauthenticatedRoutes: ["/api/v2/settings", "/api/v1/settings"],
      disabledRoutes: ["/api/v2/stations", "/api/v1/analyzer"],
    });
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: true });
    const app = await createRouteHarness(getSettings, { session: userSession(readUserId, "admin") });
    const response = await app.inject({ url: "/settings" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.access).toEqual({ openRoutes: ["/api/v2/settings"], disabledRoutes: ["/api/v2/stations"] });
    expect(getRuntimeSettings().disabledRoutes).toContain("/api/v1/analyzer");
    expect(redisMock.multi).not.toHaveBeenCalled();
  });

  it.each([false, true])("exposes administrator-only access and disabled announcements (%s)", async (admin) => {
    Object.assign(getRuntimeSettings(), {
      enforceAuthForAllRoutes: true,
      submissionsEnabled: false,
      enableStationComments: true,
      allowedUnauthenticatedRoutes: ["/api/v2/settings"],
      disabledRoutes: ["/api/v2/stations"],
      announcement: { enabled: false, type: "info", message: "Private draft" },
    });
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: admin });
    const app = await createRouteHarness(getSettings, admin ? { session: userSession(readUserId, "admin") } : {});
    const response = await app.inject({ url: "/settings" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().data).toMatchObject({ isSignInRequired: true, features: { submissions: false, comments: true } });
    if (admin)
      expect(response.json().data).toMatchObject({
        announcement: { isEnabled: false, type: "info", message: "Private draft" },
        access: { openRoutes: ["/api/v2/settings"], disabledRoutes: ["/api/v2/stations"] },
      });
    else expect(response.json().data).toMatchObject({ announcement: null });
    if (!admin) expect(response.json().data).not.toHaveProperty("access");
  });

  it("rejects undeclared settings query parameters", async () => {
    const app = await createRouteHarness(getSettings);
    expect((await app.inject({ url: "/settings?include=access" })).statusCode).toBe(400);
  });

  it.each([true, false])("exposes the owner proposal policy to guests (%s)", async (enabled) => {
    getRuntimeSettings().structureOwnerProposalsEnabled = enabled;
    const app = await createRouteHarness(getSettings);
    const response = await app.inject({ url: "/settings" });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.features.structureOwnerProposals).toBe(enabled);
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(response.json().data).not.toHaveProperty("access");
    expect(redisMock.multi).not.toHaveBeenCalled();
  });

  it("accepts boolean owner proposal policies and rejects null in the emitted shared contract", async () => {
    const builtSettingsUrl = new URL("../../../../../../packages/shared/dist/src/contract/settings.js", import.meta.url).href;
    const { settingsFeaturesSchema }: Pick<typeof import("@openbts/shared/contract"), "settingsFeaturesSchema"> = await import(builtSettingsUrl);
    const app = await createRouteHarness(getSettings);
    const response = await app.inject({ url: "/settings" });
    expect(response.statusCode).toBe(200);
    const features = response.json().data.features;
    expect(settingsFeaturesSchema.safeParse({ ...features, structureOwnerProposals: true }).success).toBe(true);
    expect(settingsFeaturesSchema.safeParse({ ...features, structureOwnerProposals: false }).success).toBe(true);
    expect(settingsFeaturesSchema.safeParse({ ...features, structureOwnerProposals: null }).success).toBe(false);
  });
});
