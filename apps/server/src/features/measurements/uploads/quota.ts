import { contributors, devices, uploads } from "@openbts/drizzle";
import { MEASUREMENT_UPLOAD_QUOTAS } from "@openbts/shared/contract";
import type { MeasurementUploadsLimit } from "@openbts/shared/contract";
import { and, asc, count, eq, gt, min, sum } from "drizzle-orm";

import db from "../../../database/psql.js";
import { DetailedErrorResponse } from "../../../errors.js";
import { type RetryHeaders, setRetryAt } from "../../../lib/requestLimit.js";

type ExceededQuota = { quota: "uploads" | "bytes" | "deviceUploads"; message: string; freesAt: number };
type RecentUpload = { receivedAt: Date; bodyBytes: number };
type DeviceUploads = { total: number; oldestAt: Date | null };

const WINDOW_MS = MEASUREMENT_UPLOAD_QUOTAS.windowHours * 60 * 60 * 1000;
const NEW_PERSON_MS = MEASUREMENT_UPLOAD_QUOTAS.newPersonDays * 24 * 60 * 60 * 1000;

export async function findMeasurementUploadsLimit(userId: string): Promise<MeasurementUploadsLimit> {
  const now = Date.now();
  const [[recent], [contributor]] = await Promise.all([
    db
      .select({ total: count(), bytes: sum(uploads.bodyBytes), oldestAt: min(uploads.receivedAt) })
      .from(uploads)
      .innerJoin(devices, eq(devices.id, uploads.deviceId))
      .where(and(eq(devices.userId, userId), gt(uploads.receivedAt, new Date(now - WINDOW_MS)))),
    db.select({ createdAt: contributors.createdAt }).from(contributors).where(eq(contributors.userId, userId)).limit(1),
  ]);

  const isNewPerson = contributor === undefined || contributor.createdAt.getTime() > now - NEW_PERSON_MS;
  const bytes = isNewPerson ? MEASUREMENT_UPLOAD_QUOTAS.bytesPerNewPerson : MEASUREMENT_UPLOAD_QUOTAS.bytesPerPerson;
  const oldestAt = recent?.oldestAt ?? null;

  return {
    uploads: {
      limit: MEASUREMENT_UPLOAD_QUOTAS.uploadsPerPerson,
      remaining: Math.max(0, MEASUREMENT_UPLOAD_QUOTAS.uploadsPerPerson - (recent?.total ?? 0)),
    },
    bytes: { limit: bytes, remaining: Math.max(0, bytes - Number(recent?.bytes ?? 0)) },
    resetsAt: oldestAt === null ? null : new Date(oldestAt.getTime() + WINDOW_MS).toISOString(),
  };
}

export function bytesFreeAt(oldestFirst: readonly RecentUpload[], limitBytes: number, bodyBytes: number, now: number): number {
  let shortfallBytes = oldestFirst.reduce((total, upload) => total + upload.bodyBytes, bodyBytes) - limitBytes;
  for (const upload of oldestFirst) {
    shortfallBytes -= upload.bodyBytes;
    if (shortfallBytes <= 0) return upload.receivedAt.getTime() + WINDOW_MS;
  }
  return now + WINDOW_MS;
}

async function findWhenBytesFree(userId: string, limitBytes: number, bodyBytes: number): Promise<number> {
  const now = Date.now();
  const oldestFirst = await db
    .select({ receivedAt: uploads.receivedAt, bodyBytes: uploads.bodyBytes })
    .from(uploads)
    .innerJoin(devices, eq(devices.id, uploads.deviceId))
    .where(and(eq(devices.userId, userId), gt(uploads.receivedAt, new Date(now - WINDOW_MS))))
    .orderBy(asc(uploads.receivedAt));
  return bytesFreeAt(oldestFirst, limitBytes, bodyBytes, now);
}

async function countDeviceUploads(deviceId: string): Promise<DeviceUploads> {
  const [recent] = await db
    .select({ total: count(), oldestAt: min(uploads.receivedAt) })
    .from(uploads)
    .where(and(eq(uploads.deviceId, deviceId), gt(uploads.receivedAt, new Date(Date.now() - WINDOW_MS))));
  return { total: recent?.total ?? 0, oldestAt: recent?.oldestAt ?? null };
}

async function findExceededQuota(
  userId: string,
  person: MeasurementUploadsLimit,
  device: DeviceUploads,
  bodyBytes: number,
): Promise<ExceededQuota | null> {
  const { windowHours, uploadsPerPerson, uploadsPerDevice } = MEASUREMENT_UPLOAD_QUOTAS;
  if (person.uploads.remaining < 1) {
    const freesAt = person.resetsAt === null ? Date.now() + WINDOW_MS : Date.parse(person.resetsAt);
    return { quota: "uploads", message: `At most ${uploadsPerPerson} uploads in ${windowHours} hours`, freesAt };
  }
  if (person.bytes.remaining < bodyBytes) {
    const freesAt = await findWhenBytesFree(userId, person.bytes.limit, bodyBytes);
    return { quota: "bytes", message: `At most ${person.bytes.limit / 1024 / 1024} MiB of uploads in ${windowHours} hours`, freesAt };
  }
  if (device.total < uploadsPerDevice) return null;
  return {
    quota: "deviceUploads",
    message: `At most ${uploadsPerDevice} uploads from one device in ${windowHours} hours`,
    freesAt: (device.oldestAt?.getTime() ?? Date.now()) + WINDOW_MS,
  };
}

export async function assertUploadQuotas(res: RetryHeaders, userId: string, deviceId: string, bodyBytes: number): Promise<void> {
  const [person, device] = await Promise.all([findMeasurementUploadsLimit(userId), countDeviceUploads(deviceId)]);
  const exceeded = await findExceededQuota(userId, person, device, bodyBytes);
  if (exceeded === null) return;

  setRetryAt(res, exceeded.freesAt);
  throw new DetailedErrorResponse("MEASUREMENT_QUOTA_EXCEEDED", [{ quota: exceeded.quota }], { message: exceeded.message });
}
