import { createHash, createHmac, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { verifyAttestation } from "../../../../../../src/features/measurements/attestation/verify.js";
import { issueDeviceChallenge, useDeviceChallenge } from "../../../../../../src/features/measurements/challenges.js";
import route from "../../../../../../src/routes/v2/(post)/measurements/devices/index.js";
import { dbMock, redisMock, userSession } from "../../../../../helpers/boundaries.js";
import { appClientId, appToken, crowdSettingsRow, deviceId, deviceRow, setMeasurementUploads } from "../../../../../helpers/measurementFixtures.js";
import { expectError, injectMutation } from "../../../../../helpers/mutationAssertions.js";

vi.mock(import("../../../../../../src/features/measurements/attestation/verify.js"), async (importOriginal) => ({
  ...(await importOriginal()),
  verifyAttestation: vi.fn(),
}));

const userId = userSession().user.id;
const phoneKey = randomBytes(32);
const deviceKey = generateKeyPairSync("ec", { namedCurve: "P-256" });
const publicKey = deviceKey.publicKey.export({ type: "spki", format: "der" });
const phoneId = createHash("sha256").update("android-id").digest("base64url");
const otherUserId = "22222222-2222-4222-8222-222222222222";

function registration(challenge: string, overrides: Record<string, unknown> = {}) {
  return {
    challenge,
    challengeSignature: sign("sha256", Buffer.from(challenge, "base64url"), { key: deviceKey.privateKey, dsaEncoding: "der" }).toString("base64url"),
    publicKey: publicKey.toString("base64url"),
    certificateChain: [],
    label: "Pixel 8",
    phoneId,
    hardware: { manufacturer: "Google", model: "Pixel 8", socManufacturer: "Google", socModel: "Tensor G3", sdkInt: 35 },
    app: { versionCode: 140, versionName: "1.4.0" },
    ...overrides,
  };
}

function register(payload: object) {
  return injectMutation(route, { method: "POST", url: "/measurements/devices", payload }, { session: userSession(), oauthToken: appToken() });
}

function scriptChecks({
  keyHolder = [] as unknown[],
  phoneHolder = [] as unknown[],
  acceptedVersion = 2,
  isBlocked = false,
  active = 0,
  recent = 0,
  oldestRecentAt = null as Date | null,
} = {}) {
  dbMock.enqueueFor("select", "devices", keyHolder, [{ active, recent, oldestRecentAt }], phoneHolder);
  dbMock.enqueueFor("select", "crowd_settings", [crowdSettingsRow]);
  dbMock.enqueueFor("select", "terms_acceptances", [{ version: acceptedVersion, acceptedAt: new Date() }]);
  dbMock.enqueueFor("select", "contributor_blocks", isBlocked ? [{ until: null }] : []);
}

function scriptInsert() {
  dbMock.enqueueFor("insert", "socs", [{ id: 3 }]);
  dbMock.enqueueFor("insert", "device_models", [{ id: 7 }]);
  dbMock.enqueueFor("insert", "devices", [{ id: deviceId }]);
  dbMock.enqueueFor("select", "devices", [deviceRow()]);
}

function insertedInto(table: string) {
  return dbMock.calls.find((call) => call.operation === "insert" && call.table === table)?.values;
}

beforeEach(() => {
  setMeasurementUploads(true);
  vi.stubEnv("OBSERVATIONS_PHONE_KEY", phoneKey.toString("base64"));
});

afterEach(() => {
  setMeasurementUploads(false);
  vi.unstubAllEnvs();
});

describe("POST /measurements/devices", () => {
  it("registers a key without attestation, keeping only an HMAC of the phone id", async () => {
    const { challenge } = await issueDeviceChallenge(userId, appClientId);
    scriptChecks();
    scriptInsert();
    const response = await register(registration(challenge));

    expect(response.statusCode).toBe(201);
    expect(insertedInto("devices")).toEqual({
      userId,
      modelId: 7,
      publicKey,
      phoneHmac: createHmac("sha256", phoneKey).update(Buffer.from(phoneId, "base64url")).digest(),
      label: "Pixel 8",
    });
  });

  it("stores what the key's attestation says about the phone", async () => {
    const { challenge } = await issueDeviceChallenge(userId, appClientId);
    const leaf = Buffer.from("leaf certificate");
    vi.mocked(verifyAttestation).mockResolvedValue({
      record: {
        root: "googleEc",
        securityLevel: "trustedEnvironment",
        keymintSecurityLevel: "trustedEnvironment",
        verifiedBootState: "verified",
        isBootloaderLocked: true,
        verifiedBootKey: Buffer.alloc(32, 1),
        osVersion: 160000,
        osPatchLevel: 202602,
        vendorPatchLevel: 20260205,
        bootPatchLevel: 20260205,
        attestedPackage: "pl.btsearch.app",
      },
      signatureDigests: [Buffer.alloc(32, 2)],
      certificates: [{ serial: Buffer.from([1]), der: leaf }],
    });
    scriptChecks();
    scriptInsert();
    dbMock.enqueueFor("insert", "device_attestations", []);
    dbMock.enqueueFor("insert", "device_attested_signatures", []);
    dbMock.enqueueFor("insert", "device_certificates", []);
    const response = await register(registration(challenge, { certificateChain: [leaf.toString("base64url")] }));

    expect(response.statusCode).toBe(201);
    expect(vi.mocked(verifyAttestation)).toHaveBeenCalledWith([leaf], Buffer.from(challenge, "base64url"), publicKey, expect.any(Date));
    expect(insertedInto("device_attestations")).toMatchObject({ deviceId, root: "googleEc", attestedPackage: "pl.btsearch.app" });
    expect(insertedInto("device_attested_signatures")).toEqual([{ deviceId, digest: Buffer.alloc(32, 2) }]);
    expect(insertedInto("device_certificates")).toEqual([{ deviceId, position: 0, serial: Buffer.from([1]), der: leaf }]);
  });

  it("answers 200 with the device when its key is sent again, even while uploads are switched off", async () => {
    setMeasurementUploads(false);
    dbMock.enqueueFor("select", "devices", [{ id: deviceId, userId }], [deviceRow()]);
    expect((await register(registration(randomBytes(32).toString("base64url")))).statusCode).toBe(200);
  });

  it("refuses a key that another account registered once the challenge is signed with it", async () => {
    const { challenge } = await issueDeviceChallenge(userId, appClientId);
    scriptChecks({ keyHolder: [{ id: deviceId, userId: otherUserId }] });
    expectError(await register(registration(challenge)), 409, "DEVICE_KEY_IN_USE");
  });

  it("refuses a phone that another account registered once the challenge is signed", async () => {
    const { challenge } = await issueDeviceChallenge(userId, appClientId);
    scriptChecks({ phoneHolder: [{ id: deviceId }] });
    expectError(await register(registration(challenge)), 409, "PHONE_IN_USE");
    expect(redisMock.getDel).toHaveBeenCalled();
  });

  it("refuses a key that another account registered while this registration ran", async () => {
    const { challenge } = await issueDeviceChallenge(userId, appClientId);
    scriptChecks();
    dbMock.enqueueFor("insert", "socs", [{ id: 3 }]);
    dbMock.enqueueFor("insert", "device_models", [{ id: 7 }]);
    dbMock.enqueueFor("insert", "devices", []);
    dbMock.enqueueFor("select", "devices", [{ id: deviceId, userId: otherUserId }]);
    expectError(await register(registration(challenge)), 409, "DEVICE_KEY_IN_USE");
  });

  it("answers 200 with the device when the same registration is sent while the first one still runs", async () => {
    const { challenge } = await issueDeviceChallenge(userId, appClientId);
    await useDeviceChallenge(Buffer.from(challenge, "base64url"), userId, appClientId, publicKey);
    scriptChecks();
    dbMock.enqueueFor("insert", "socs", [{ id: 3 }]);
    dbMock.enqueueFor("insert", "device_models", [{ id: 7 }]);
    dbMock.enqueueFor("insert", "devices", []);
    dbMock.enqueueFor("select", "devices", [{ id: deviceId, userId }], [deviceRow()]);
    expect((await register(registration(challenge))).statusCode).toBe(200);
  });

  it.each([
    { name: "a challenge it was never given", challenge: () => randomBytes(32).toString("base64url") },
    {
      name: "another account's challenge",
      challenge: async () => (await issueDeviceChallenge(otherUserId, appClientId)).challenge,
    },
    {
      name: "a challenge another key used",
      challenge: async () => {
        const { challenge } = await issueDeviceChallenge(userId, appClientId);
        const otherPublicKey = generateKeyPairSync("ec", { namedCurve: "P-256" }).publicKey.export({ type: "spki", format: "der" });
        await useDeviceChallenge(Buffer.from(challenge, "base64url"), userId, appClientId, otherPublicKey);
        return challenge;
      },
    },
  ])("refuses $name", async ({ challenge }) => {
    scriptChecks();
    const response = await register(registration(await challenge()));

    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([
      { field: "challenge", validationMessage: "Unknown, expired or used by another key. Ask for a new challenge" },
    ]);
  });

  it("refuses a challenge signed with another key, without telling whether another account holds the key", async () => {
    const { challenge } = await issueDeviceChallenge(userId, appClientId);
    const otherKey = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    const signature = sign("sha256", Buffer.from(challenge, "base64url"), { key: otherKey, dsaEncoding: "der" }).toString("base64url");
    scriptChecks({ keyHolder: [{ id: deviceId, userId: otherUserId }] });
    const response = await register(registration(challenge, { challengeSignature: signature }));

    expectError(response, 400, "VALIDATION_ERROR");
    expect(response.json().errors[0].details).toEqual([{ field: "challengeSignature", validationMessage: "Does not verify with `publicKey`" }]);
  });

  it.each([
    {
      name: "an app older than the minimum version",
      body: { app: { versionCode: 99, versionName: "0.9.9" } },
      checks: {},
      status: 403,
      code: "APP_UPDATE_REQUIRED",
    },
    { name: "a person who has not accepted the current terms", body: {}, checks: { acceptedVersion: 1 }, status: 403, code: "TERMS_NOT_ACCEPTED" },
    { name: "a person who is blocked", body: {}, checks: { isBlocked: true }, status: 403, code: "CONTRIBUTOR_BLOCKED" },
    { name: "a person with 5 active devices", body: {}, checks: { active: 5 }, status: 409, code: "DEVICE_LIMIT_REACHED" },
  ])("refuses $name and keeps the challenge", async ({ body, checks, status, code }) => {
    const { challenge } = await issueDeviceChallenge(userId, appClientId);
    scriptChecks(checks);
    expectError(await register(registration(challenge, body)), status, code);
    expect(redisMock.getDel).not.toHaveBeenCalled();
  });

  it("refuses a fourth registration in a day until the oldest of the three is a day old", async () => {
    const { challenge } = await issueDeviceChallenge(userId, appClientId);
    scriptChecks({ recent: 3, oldestRecentAt: new Date(Date.now() - 23 * 60 * 60 * 1000) });
    const response = await register(registration(challenge));

    expectError(response, 429, "DEVICE_REGISTRATION_LIMIT_REACHED");
    expect(Number(response.headers["retry-after"])).toBeGreaterThan(3590);
    expect(Number(response.headers["retry-after"])).toBeLessThanOrEqual(3600);
    expect(response.headers["x-retry-after"]).toBe(response.headers["retry-after"]);
  });
});
