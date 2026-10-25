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
  it("refuses scope=all to someone who is not an administrator", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    expectError(await get(getDevices, "/measurements/devices?scope=all"), 403, "FORBIDDEN", "Only an administrator can send `scope=all`");
  });

  it("refuses sort=weight to someone who is not an administrator", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    expectError(await get(getDevices, "/measurements/devices?sort=weight"), 403, "FORBIDDEN");
  });

  it("gives an administrator another person's devices by userIds without scope=all", async () => {
    dbMock.enqueueFor("select", "devices", [deviceRow({ userId: otherUserId })], [], []);
    const response = await get(getDevices, `/measurements/devices?userIds=${otherUserId}`, userSession(userId, "admin"));

    expect(response.statusCode).toBe(200);
    expect(whereQuery("devices", "select").params).not.toContain(userId);
  });

  it("answers 400 for a weight cursor whose key is not a number", async () => {
    const cursor = Buffer.from(JSON.stringify({ sort: "weight", id: deviceId, key: "heavy" })).toString("base64url");
    expectError(
      await get(getDevices, `/measurements/devices?scope=all&sort=weight&cursor=${cursor}`, userSession(userId, "admin")),
      400,
      "INVALID_QUERY",
    );
  });

  it("gives an administrator the owners, and no owner for a device whose account was deleted", async () => {
    dbMock.enqueueFor("select", "devices", [deviceRow(), deviceRow({ id: "01a0bdd4-4400-7d2e-8f30-415263748597", userId: null })], [], []);
    dbMock.enqueueFor("select", "users", [{ id: userId, username: "tester", name: "Test User", image: null }]);
    const response = await get(getDevices, "/measurements/devices?scope=all&include=owner", userSession(userId, "admin"));

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
    dbMock.enqueueFor("select", "devices", [device], [], ...(canManage ? [[]] : []));
    expect((await get(getDevice, `/measurements/devices/${deviceId}`)).statusCode).toBe(200);
  });

  it("answers the calibration of the device's own model's group over its modem family's, and its weight only to an administrator", async () => {
    const groups = [
      { deviceId, taGroupId: 3, source: "api", deviceModelId: null },
      { deviceId, taGroupId: 9, source: "api", deviceModelId: 7 },
    ];
    const fits = [
      { taGroupId: 9, rat: "GSM", scale: 0.98, offsetM: 40 },
      { taGroupId: 9, rat: "LTE", scale: 1.02, offsetM: 12 },
      { taGroupId: 9, rat: "UMTS", scale: 1, offsetM: 0 },
    ];
    const calibration = [
      { source: "api", rat: "gsm", metersPerStep: 564.76, offsetMeters: -40.82 },
      { source: "api", rat: "lte", metersPerStep: 76.54, offsetMeters: -11.76 },
    ];
    const weight = { computed: 0.5, effective: 1, basis: "device" };

    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "devices", [deviceRow()], groups);
    dbMock.enqueueFor("select", "ta_calibrations", fits);
    const owner = (await get(getDevice, `/measurements/devices/${deviceId}`)).json().data;

    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: true });
    dbMock.enqueueFor("select", "devices", [deviceRow({ userId: otherUserId })], groups, [{ deviceId, ...weight, own: null, setBy: null }]);
    dbMock.enqueueFor("select", "ta_calibrations", fits);
    const administrator = (await get(getDevice, `/measurements/devices/${deviceId}`, userSession(userId, "admin"))).json().data;

    expect(owner.timingAdvance).toEqual(calibration);
    expect(owner).not.toHaveProperty("weight");
    expect(administrator.timingAdvance).toEqual(calibration);
    expect(administrator.weight).toEqual({ ...weight, own: null });
  });

  it("tells an administrator who revoked a device and the weight set on it, and its owner neither", async () => {
    const revokedAt = new Date("2026-10-22T08:00:00Z");
    const setAt = new Date("2026-10-23T09:00:00Z");
    const staff = { id: userId, username: "staff", name: "Staff Member", image: null };
    const revoked = deviceRow({ userId: otherUserId, revokedAt, revokedById: userId, revocationReason: "Emulator" });
    const weightRow = {
      deviceId,
      computed: 0.1,
      effective: 0.3,
      basis: "device",
      own: { value: 0.3, reason: "A test phone", setAt },
      setBy: staff,
    };

    dbMock.enqueueFor("select", "devices", [revoked], [], [weightRow]);
    dbMock.enqueueFor("select", "users", [staff]);
    const administrator = (await get(getDevice, `/measurements/devices/${deviceId}`, userSession(userId, "admin"))).json().data;

    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "devices", [deviceRow({ revokedAt, revokedById: userId })], []);
    const owner = (await get(getDevice, `/measurements/devices/${deviceId}`)).json().data;

    expect(administrator.revocation).toEqual({ reason: "Emulator", by: staff, at: revokedAt.toISOString() });
    expect(administrator.weight.own).toEqual({ value: 0.3, reason: "A test phone", by: staff, at: setAt.toISOString() });
    expect(owner.revocation).toEqual({ reason: null, at: revokedAt.toISOString() });
    expect(owner).not.toHaveProperty("weight");
  });

  it("hides another person's device from someone who is not an administrator", async () => {
    authBoundary.auth.api.userHasPermission.mockResolvedValue({ success: false });
    dbMock.enqueueFor("select", "devices", [deviceRow({ userId: otherUserId })]);
    expectError(await get(getDevice, `/measurements/devices/${deviceId}`), 404, "NOT_FOUND");
  });
});
