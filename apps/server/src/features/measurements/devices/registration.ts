import { deviceAttestations, deviceAttestedSignatures, deviceCertificates, deviceRevocations, devices } from "@openbts/drizzle";
import { MEASUREMENT_DEVICE_LIMITS } from "@openbts/shared/contract";
import type { MeasurementDeviceCreate } from "@openbts/shared/contract";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { type KeyObject, createHmac, createPublicKey, verify } from "node:crypto";

import db from "../../../database/psql.js";
import { ErrorResponse, ValidationError } from "../../../errors.js";
import { type RetryHeaders, setRetryAt } from "../../../lib/requestLimit.js";
import { type VerifiedAttestation, verifyAttestation } from "../attestation/verify.js";
import { assertMayContribute } from "../contributors/eligibility.js";
import { assertMeasurementUploadsEnabled } from "../settings.js";
import { useDeviceChallenge } from "./challenges.js";
import { saveDeviceModel } from "./hardware.js";
import { type DeviceRow, findDevice } from "./read.js";

const DAY_MS = 24 * 60 * 60 * 1000;

type DeviceCounts = { active: number; recent: number; oldestRecentAt: Date | null };
export type Registration = { device: DeviceRow; isNew: boolean };

async function findKeyHolder(publicKey: Buffer): Promise<{ id: string; userId: string | null } | undefined> {
  const [holder] = await db.select({ id: devices.id, userId: devices.userId }).from(devices).where(eq(devices.publicKey, publicKey)).limit(1);
  return holder;
}

async function isPhoneOnAnotherAccount(phone: Buffer, userId: string): Promise<boolean> {
  const [device] = await db
    .select({ id: devices.id })
    .from(devices)
    .where(and(eq(devices.phoneHmac, phone), ne(devices.userId, userId)))
    .limit(1);
  return device !== undefined;
}

async function countDevices(userId: string): Promise<DeviceCounts> {
  const isRecent = gt(devices.createdAt, new Date(Date.now() - DAY_MS));
  const [counts] = await db
    .select({
      active: sql<number>`count(*) FILTER (WHERE ${isNull(deviceRevocations.deviceId)})`.mapWith(Number),
      recent: sql<number>`count(*) FILTER (WHERE ${isRecent})`.mapWith(Number),
      oldestRecentAt: sql`min(${devices.createdAt}) FILTER (WHERE ${isRecent})`.mapWith(devices.createdAt),
    })
    .from(devices)
    .leftJoin(deviceRevocations, eq(deviceRevocations.deviceId, devices.id))
    .where(eq(devices.userId, userId));
  return { active: counts?.active ?? 0, recent: counts?.recent ?? 0, oldestRecentAt: counts?.oldestRecentAt ?? null };
}

function assertDeviceLimits(res: RetryHeaders, counts: DeviceCounts): void {
  if (counts.active >= MEASUREMENT_DEVICE_LIMITS.activeDevices) throw new ErrorResponse("DEVICE_LIMIT_REACHED");
  if (counts.recent < MEASUREMENT_DEVICE_LIMITS.registrationsPerDay) return;

  setRetryAt(res, (counts.oldestRecentAt?.getTime() ?? Date.now()) + DAY_MS);
  throw new ErrorResponse("DEVICE_REGISTRATION_LIMIT_REACHED");
}

function phoneHmac(phoneId: string): Buffer {
  const key = process.env.OBSERVATIONS_PHONE_KEY?.trim();
  if (!key) throw new ErrorResponse("SERVICE_UNAVAILABLE", { cause: new Error("OBSERVATIONS_PHONE_KEY is not set") });
  return createHmac("sha256", Buffer.from(key, "base64")).update(Buffer.from(phoneId, "base64url")).digest();
}

function readDeviceKey(publicKey: Buffer): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey({ key: publicKey, format: "der", type: "spki" });
  } catch {
    throw new ValidationError([{ field: "publicKey", validationMessage: "Must be a SubjectPublicKeyInfo in DER" }]);
  }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new ValidationError([{ field: "publicKey", validationMessage: "Must be an EC P-256 key" }]);
  }
  return key;
}

function assertChallengeSigned(key: KeyObject, challenge: Buffer, signature: Buffer): void {
  let isSigned: boolean;
  try {
    isSigned = verify("sha256", challenge, { key, dsaEncoding: "der" }, signature);
  } catch {
    isSigned = false;
  }
  if (!isSigned) throw new ValidationError([{ field: "challengeSignature", validationMessage: "Does not verify with `publicKey`" }]);
}

async function insertDevice(
  userId: string,
  body: MeasurementDeviceCreate,
  publicKey: Buffer,
  phone: Buffer,
  attestation: VerifiedAttestation | null,
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const modelId = await saveDeviceModel(tx, body.hardware);
    const [device] = await tx
      .insert(devices)
      .values({ userId, modelId, publicKey, phoneHmac: phone, label: body.label ?? null })
      .onConflictDoNothing({ target: devices.publicKey })
      .returning({ id: devices.id });
    if (!device) return null;
    if (attestation === null) return device.id;

    await tx.insert(deviceAttestations).values({ deviceId: device.id, ...attestation.record });
    if (attestation.signatureDigests.length > 0) {
      await tx.insert(deviceAttestedSignatures).values(attestation.signatureDigests.map((digest) => ({ deviceId: device.id, digest })));
    }
    await tx
      .insert(deviceCertificates)
      .values(attestation.certificates.map((certificate, position) => ({ deviceId: device.id, position, ...certificate })));
    return device.id;
  });
}

export async function registerDevice(
  res: RetryHeaders,
  userId: string,
  clientId: string,
  body: MeasurementDeviceCreate,
  countAttempt: () => Promise<void>,
): Promise<Registration> {
  const publicKey = Buffer.from(body.publicKey, "base64url");
  const holder = await findKeyHolder(publicKey);
  if (holder?.userId === userId) return { device: await findDevice(holder.id), isNew: false };

  await countAttempt();
  assertMeasurementUploadsEnabled();
  const phone = phoneHmac(body.phoneId);
  const [, counts, isPhoneTaken] = await Promise.all([
    assertMayContribute(userId, body.app.versionCode),
    countDevices(userId),
    isPhoneOnAnotherAccount(phone, userId),
  ]);
  assertDeviceLimits(res, counts);
  const key = readDeviceKey(publicKey);

  const challenge = Buffer.from(body.challenge, "base64url");
  await useDeviceChallenge(challenge, userId, clientId, publicKey);
  assertChallengeSigned(key, challenge, Buffer.from(body.challengeSignature, "base64url"));
  if (holder) throw new ErrorResponse("DEVICE_KEY_IN_USE");
  if (isPhoneTaken) throw new ErrorResponse("PHONE_IN_USE");
  const chain = body.certificateChain.map((certificate) => Buffer.from(certificate, "base64url"));
  const attestation = chain.length === 0 ? null : await verifyAttestation(chain, challenge, publicKey, new Date());

  const deviceId = await insertDevice(userId, body, publicKey, phone, attestation);
  if (deviceId !== null) return { device: await findDevice(deviceId), isNew: true };

  const winner = await findKeyHolder(publicKey);
  if (!winner) throw new ErrorResponse("FAILED_TO_CREATE");
  if (winner.userId !== userId) throw new ErrorResponse("DEVICE_KEY_IN_USE");
  return { device: await findDevice(winner.id), isNew: false };
}
