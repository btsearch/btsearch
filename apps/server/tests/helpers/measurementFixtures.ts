import { deviceModels, devices, uploadFolds, uploads, users } from "@openbts/drizzle";
import type { MeasurementUploadStatus } from "@openbts/shared/contract";
import { randomBytes, randomUUID } from "node:crypto";

import type { DeviceRow } from "../../src/features/measurements/devices/read.js";
import type { StoredUpload } from "../../src/features/measurements/uploads/read.js";
import { getRuntimeSettings, mergeRuntimeSettings } from "../../src/lib/runtimeSettings.js";
import type { OAuthTokenContext } from "../../src/plugins/auth/oauthToken.js";
import type { DbTx } from "../../src/types/global.js";
import { userSession } from "./boundaries.js";
import { STAFF_ID } from "./officialFixtures.js";

type UploadFoldRow = NonNullable<StoredUpload["fold"]>;
type UploadValues = { status?: MeasurementUploadStatus; statusReason?: string | null; receivedAt?: Date; statusChangedAt?: Date };

export const appClientId = "btsearch-app";
export const deviceId = "01a0bdd4-4400-7d2e-8f30-415263748596";

export const crowdSettingsRow = {
  id: 1,
  rawRetentionDays: 365,
  rawStorageBudgetGb: 100,
  minAppVersionCode: 100,
  termsVersion: 2,
  publishedAlgorithmVersion: 1,
  publicRadiusMaxM: 1000,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
  updatedById: null,
};

type ReadingBlockOverrides = {
  id: number;
  modemFamily: string | null;
  readerVersionId: number | null;
  rats: string[] | null;
  roles: string[] | null;
  fields: string[] | null;
  mode: string;
  disabledAt: Date | null;
  disabledById: string | null;
};

export function readingBlockRow(overrides: Partial<ReadingBlockOverrides> = {}) {
  const staff = { id: STAFF_ID, username: "staff", name: "Staff Member", image: null };
  const block = {
    id: 2,
    modemFamily: "samsung",
    socId: null,
    deviceModelId: null,
    readerVersionId: null,
    rats: null,
    roles: null,
    sdkIntMin: null,
    sdkIntMax: null,
    radioVersionPrefix: null,
    fields: ["pci", "channel"],
    mode: "corroborate",
    reason: "Samsung modems misreport",
    createdById: STAFF_ID,
    createdAt: new Date("2026-10-24T10:00:00Z"),
    disabledAt: null,
    disabledById: null,
    ...overrides,
  };
  return { block, creator: staff, disabler: block.disabledById === null ? null : staff };
}

export function uploadFoldRow(uploadId: string, overrides: Partial<UploadFoldRow> = {}): UploadFoldRow {
  return {
    uploadId,
    foldVersion: 1,
    weightMilli: 1000,
    foldedAt: new Date("2026-10-20T10:02:00Z"),
    formatVersion: 1,
    sdkInt: 35,
    securityPatch: "2026-09-05",
    radioVersion: "g5300q-250909-251024-B-14326967",
    appVersionName: "1.4.0",
    modemFamily: "samsung",
    outlineVersion: 1,
    startedAt: new Date("2026-10-20T08:00:00Z"),
    endedAt: new Date("2026-10-20T09:30:00Z"),
    west: 20.95,
    south: 52.18,
    east: 21.08,
    north: 52.26,
    snapshotCount: 900,
    sampleCount: 1200,
    distanceOnlyCount: 0,
    wallClockErrorMs: null,
    unfoldedAt: null,
    ...overrides,
  };
}

export function setMeasurementUploads(isEnabled: boolean): void {
  Object.assign(getRuntimeSettings(), mergeRuntimeSettings(getRuntimeSettings(), { measurementUploadsEnabled: isEnabled }));
}

export function appToken(userId = userSession().user.id): OAuthTokenContext {
  return { clientId: appClientId, scopes: ["upload:observations"], userId };
}

export function deviceRow(overrides: Partial<DeviceRow> = {}): DeviceRow {
  return {
    id: deviceId,
    userId: userSession().user.id,
    label: "Pixel 8",
    createdAt: new Date("2026-10-20T10:00:00Z"),
    manufacturer: "Google",
    model: "Pixel 8",
    socModel: "Tensor G3",
    tier: "none",
    securityLevel: null,
    verifiedBootState: null,
    isBootloaderLocked: null,
    revokedAt: null,
    revokedById: null,
    revocationReason: null,
    lastUploadAt: null,
    software: null,
    sortKey: null,
    ...overrides,
  };
}

export async function insertPerson(tx: DbTx): Promise<string> {
  const [person] = await tx
    .insert(users)
    .values({ email: `${randomUUID()}@crowd-test.invalid`, name: "Crowd test" })
    .returning({ id: users.id });
  if (!person) throw new Error("The person was not added");
  return person.id;
}

export async function insertDevice(
  tx: DbTx,
  { userId, socId = null, board = null }: { userId: string | null; socId?: number | null; board?: string | null },
): Promise<{ deviceId: string; modelId: number }> {
  const [model] = await tx
    .insert(deviceModels)
    .values({ manufacturer: "Crowd test", model: `phone-${randomUUID()}`, socId, board })
    .returning({ id: deviceModels.id });
  if (!model) throw new Error("The phone model was not added");

  const [device] = await tx
    .insert(devices)
    .values({ userId, modelId: model.id, publicKey: randomBytes(65) })
    .returning({ id: devices.id });
  if (!device) throw new Error("The device was not added");
  return { deviceId: device.id, modelId: model.id };
}

export async function insertUpload(tx: DbTx, fromDevice: string, values: UploadValues = {}): Promise<string> {
  const id = randomUUID();
  await tx.insert(uploads).values({
    id,
    deviceId: fromDevice,
    encoding: "zstd",
    sealKeyId: "test",
    bodyBytes: 100,
    bodySha256: randomBytes(32),
    store: "disk",
    appVersionCode: 1,
    ...values,
  });
  return id;
}

export async function insertFold(tx: DbTx, uploadId: string, overrides: Partial<UploadFoldRow> = {}): Promise<void> {
  await tx.insert(uploadFolds).values(uploadFoldRow(uploadId, overrides));
}
