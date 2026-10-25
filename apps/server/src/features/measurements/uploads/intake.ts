import { deviceRevocations, devices, uploads } from "@openbts/drizzle";
import { MEASUREMENT_SIGNATURE_CONTEXT, MEASUREMENT_UPLOAD_LIMITS } from "@openbts/shared/contract";
import type { MeasurementContentType, MeasurementUploadHeaders } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import { createInsertSchema } from "drizzle-orm/zod";
import { createHash, createPublicKey, verify } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { z } from "zod/v4";

import db from "../../../database/psql.js";
import { ErrorResponse, ValidationError } from "../../../errors.js";
import { type RetryHeaders, setRetryAfter } from "../../../lib/requestLimit.js";
import { logger } from "../../../utils/logger.js";
import { assertMayContribute } from "../contributors/eligibility.js";
import { wakeEngineForUploads } from "../engineRuns.js";
import { sealUpload } from "../rawFiles/seal.js";
import { type CreateOutcome, type RawStore, newUploadsStore, rawFilePath, uploadFilePath } from "../rawFiles/store.js";
import { readStoredBytes } from "../rawFiles/storedBytes.js";
import { type CrowdSettings, loadCrowdSettings } from "../settings.js";
import { assertBodyIs, encodingOf, readContentType, readRequestBody } from "./body.js";
import { assertUploadQuotas } from "./quota.js";
import { type StoredUpload, type UploadRow, selectUploads } from "./read.js";

type UploadRequest = {
  uploadId: string;
  headers: MeasurementUploadHeaders;
  contentTypeHeader: string | undefined;
  raw: IncomingMessage;
};
type Intake = StoredUpload & { isNew: boolean; retentionDays: number };

const uploadInsertSchema = createInsertSchema(uploads);
type UploadInsert = z.infer<typeof uploadInsertSchema>;

const DAY_MS = 24 * 60 * 60 * 1000;
const UPLOAD_ID_MAX_AGE_MS = 120 * DAY_MS;
const UPLOAD_ID_MAX_LEAD_MS = DAY_MS;
const MIN_FREE_DISK_FRACTION = 0.1;
const FULL_STORE_RETRY_SECONDS = 6 * 60 * 60;
const STORE_FAILURE_RETRY_SECONDS = 60;

function unavailable(res: RetryHeaders, retrySeconds: number, message: string, cause?: unknown): ErrorResponse {
  setRetryAfter(res, retrySeconds);
  return new ErrorResponse("SERVICE_UNAVAILABLE", { message, cause });
}

function assertUploadIdInRange(uploadId: string): void {
  const createdAt = Number.parseInt(uploadId.replaceAll("-", "").slice(0, 12), 16);
  const now = Date.now();
  if (createdAt < now - UPLOAD_ID_MAX_AGE_MS || createdAt > now + UPLOAD_ID_MAX_LEAD_MS) {
    throw new ValidationError([{ field: "id", validationMessage: "Its time must lie between 120 days ago and one day ahead" }]);
  }
}

async function findUploadingDevice(userId: string, deviceId: string) {
  const [device] = await db
    .select({ id: devices.id, userId: devices.userId, publicKey: devices.publicKey, revokedAt: deviceRevocations.revokedAt })
    .from(devices)
    .leftJoin(deviceRevocations, eq(deviceRevocations.deviceId, devices.id))
    .where(eq(devices.id, deviceId))
    .limit(1);
  if (!device || device.userId !== userId) throw new ErrorResponse("DEVICE_NOT_FOUND");
  if (device.revokedAt !== null) throw new ErrorResponse("DEVICE_REVOKED");
  return device;
}

export function signedUploadLines(uploadId: string, deviceId: string, contentType: MeasurementContentType, sha256: Buffer): Buffer {
  return Buffer.from(
    [MEASUREMENT_SIGNATURE_CONTEXT, `PUT /api/v2/measurements/uploads/${uploadId}`, deviceId, contentType, sha256.toString("base64url")].join("\n"),
  );
}

function assertSigned(publicKey: Buffer, lines: Buffer, signature: string): void {
  let isSigned: boolean;
  try {
    isSigned = verify(
      "sha256",
      lines,
      { key: createPublicKey({ key: publicKey, format: "der", type: "spki" }), dsaEncoding: "der" },
      Buffer.from(signature, "base64url"),
    );
  } catch {
    isSigned = false;
  }
  if (!isSigned) throw new ErrorResponse("INVALID_SIGNATURE");
}

async function assertStoreHasRoom(res: RetryHeaders, store: RawStore, settings: CrowdSettings): Promise<void> {
  const [storedBytes, space] = await Promise.all([readStoredBytes(), store.freeSpace()]);
  const isOverBudget = storedBytes >= settings.rawStorageBudgetGb * 1024 ** 3;
  const isDiskShort = space !== null && space.freeBytes < space.totalBytes * MIN_FREE_DISK_FRACTION;
  if (isOverBudget || isDiskShort) {
    throw unavailable(res, FULL_STORE_RETRY_SECONDS, "Measurement storage is full. Send the upload again in a few hours");
  }
}

function assertSameUpload(upload: UploadRow, deviceId: string, sha256: Buffer): void {
  if (upload.deviceId !== deviceId || !upload.bodySha256.equals(sha256)) throw new ErrorResponse("UPLOAD_ID_CONFLICT");
}

async function storeSealed(res: RetryHeaders, store: RawStore, path: string, uploadId: string, body: Buffer) {
  try {
    const sealed = sealUpload(uploadId, body);
    return { keyId: sealed.keyId, outcome: await store.create(path, sealed.bytes) };
  } catch (error) {
    throw unavailable(res, STORE_FAILURE_RETRY_SECONDS, "The upload could not be stored. Send it again later", error);
  }
}

async function recordUpload(values: UploadInsert): Promise<UploadRow | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(uploads).values(values).onConflictDoNothing({ target: uploads.id }).returning();
    if (row) await wakeEngineForUploads(tx);
    return row ?? null;
  });
}

async function settleLostRace(store: RawStore, path: string, outcome: CreateOutcome, uploadId: string): Promise<UploadRow> {
  const [winner] = await selectUploads().where(eq(uploads.id, uploadId)).limit(1);
  if (!winner) throw new ErrorResponse("FAILED_TO_CREATE");

  if (outcome === "written" && uploadFilePath(winner.upload) !== path) {
    await store.remove(path).catch((error: unknown) => logger.warn("observations.upload.orphan_left", { uploadId, path, error }));
  }
  return winner.upload;
}

export async function receiveUpload(res: RetryHeaders, userId: string, request: UploadRequest): Promise<Intake> {
  const uploadId = request.uploadId.toLowerCase();
  const deviceId = request.headers["x-device-id"].toLowerCase();
  const contentType = readContentType(request.contentTypeHeader);

  const [stored] = await selectUploads().where(eq(uploads.id, uploadId)).limit(1);
  if (stored && stored.userId !== userId) throw new ErrorResponse("NOT_FOUND");
  const settings = stored ? await loadCrowdSettings() : await assertMayContribute(userId, request.headers["x-app-version-code"]);
  if (!stored) assertUploadIdInRange(uploadId);

  const body = await readRequestBody(request.raw, MEASUREMENT_UPLOAD_LIMITS.bodyBytes);
  assertBodyIs(contentType, body);
  const sha256 = createHash("sha256").update(body).digest();
  if (stored) {
    assertSameUpload(stored.upload, deviceId, sha256);
    return { upload: stored.upload, fold: stored.fold, isNew: false, retentionDays: settings.rawRetentionDays };
  }

  const device = await findUploadingDevice(userId, deviceId);
  assertSigned(device.publicKey, signedUploadLines(uploadId, deviceId, contentType, sha256), request.headers["x-device-signature"]);
  await assertUploadQuotas(res, userId, deviceId, body.length);
  const store = newUploadsStore();
  await assertStoreHasRoom(res, store, settings);

  const receivedAt = new Date();
  const path = rawFilePath(receivedAt, uploadId, sha256);
  const { keyId, outcome } = await storeSealed(res, store, path, uploadId, body);
  const recorded = await recordUpload({
    id: uploadId,
    deviceId,
    encoding: encodingOf(contentType),
    sealKeyId: keyId,
    bodyBytes: body.length,
    bodySha256: sha256,
    store: store.name,
    appVersionCode: request.headers["x-app-version-code"],
    receivedAt,
    statusChangedAt: receivedAt,
  });
  if (recorded) return { upload: recorded, fold: null, isNew: true, retentionDays: settings.rawRetentionDays };

  const winner = await settleLostRace(store, path, outcome, uploadId);
  assertSameUpload(winner, deviceId, sha256);
  return { upload: winner, fold: null, isNew: false, retentionDays: settings.rawRetentionDays };
}
