import { describe, expect, it } from "vitest";

import getDevice from "../../../../../../src/routes/v2/(get)/measurements/devices/[id].js";
import getDevices from "../../../../../../src/routes/v2/(get)/measurements/devices/index.js";
import { authBoundary, dbMock, userSession } from "../../../../../helpers/boundaries.js";
import { deviceId, deviceRow } from "../../../../../helpers/measurementFixtures.js";
import { expectError, whereQuery } from "../../../../../helpers/mutationAssertions.js";
import { createRouteHarness } from "../../../../../helpers/routeHarness.js";

const userId = userSession().user.id;
const otherUserId = "22222222-2222-4222-8222-222222222222";

async function get(route: typeof getDevices | typeof getDevice, url: string, session = userSession()) {
  const app = await createRouteHarness(route, { session });
  return app.inject({ url });
}

describe("GET /measurements/devices", () => {
  it("lists only your own devices", async () => {
    dbMock.enqueueFor("select", "devices", [deviceRow()]);
    const response = await get(getDevices, "/measurements/devices");

    expect(response.statusCode).toBe(200);
    expect(whereQuery("devices", "select").params).toContain(userId);
  });

  it("refuses every person's devices to someone who is not an administrator", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    expectError(await get(getDevices, "/measurements/devices?owners=all"), 403, "FORBIDDEN");
  });

  it("gives an administrator the owners, and no owner for a device whose account was deleted", async () => {
    dbMock.enqueueFor("select", "devices", [deviceRow(), deviceRow({ id: "01a0bdd4-4400-7d2e-8f30-415263748597", userId: null })]);
    dbMock.enqueueFor("select", "users", [{ id: userId, username: "tester", name: "Test User", image: null }]);
    const response = await get(getDevices, "/measurements/devices?owners=all&include=owner", userSession(userId, "admin"));

    expect(response.statusCode).toBe(200);
    expect(response.json().data.map((device: { owner: unknown }) => device.owner)).toEqual([
      { id: userId, username: "tester", name: "Test User", image: null },
      null,
    ]);
  });
});

describe("GET /measurements/devices/:id", () => {
  it.each([
    { viewer: "its owner", device: deviceRow(), canManage: false },
    { viewer: "an administrator", device: deviceRow({ userId: otherUserId }), canManage: true },
  ])("shows a device to $viewer", async ({ device, canManage }) => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: canManage });
    dbMock.enqueueFor("select", "devices", [device]);
    expect((await get(getDevice, `/measurements/devices/${deviceId}`)).statusCode).toBe(200);
  });

  it("hides another person's device from someone who is not an administrator", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "devices", [deviceRow({ userId: otherUserId })]);
    expectError(await get(getDevice, `/measurements/devices/${deviceId}`), 404, "NOT_FOUND");
  });
});
