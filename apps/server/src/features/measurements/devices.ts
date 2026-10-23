import { deviceAttestations, deviceModels, deviceRevocations, deviceTiers, devices, socs, uploads, users } from "@openbts/drizzle";
import type { MeasurementDevice, MeasurementDeviceUpdate, UserRef } from "@openbts/shared/contract";
import { type SQL, eq, inArray, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import type { DbTx } from "../../types/global.js";
import { hasStaffPermission } from "../access/staff.js";
import { type AuditRecorder, runAuditedOperation, standaloneAuditContext } from "../audit/index.js";
import { toUserRef } from "../users/userRef.js";

const lastUploadAt: SQL<Date | null> = sql`(SELECT max(${uploads.receivedAt}) FROM ${uploads} WHERE ${uploads.deviceId} = ${devices.id})`.mapWith(
  uploads.receivedAt,
);

export function selectDevices(sortKey: SQL<string | null> = sql<null>`NULL`) {
  return db
    .select({
      id: devices.id,
      userId: devices.userId,
      label: devices.label,
      createdAt: devices.createdAt,
      manufacturer: deviceModels.manufacturer,
      model: deviceModels.model,
      socModel: socs.model,
      tier: deviceTiers.tier,
      securityLevel: deviceAttestations.securityLevel,
      verifiedBootState: deviceAttestations.verifiedBootState,
      isBootloaderLocked: deviceAttestations.isBootloaderLocked,
      revokedAt: deviceRevocations.revokedAt,
      revocationReason: deviceRevocations.reason,
      lastUploadAt,
      sortKey,
    })
    .from(devices)
    .innerJoin(deviceModels, eq(deviceModels.id, devices.modelId))
    .innerJoin(deviceTiers, eq(deviceTiers.deviceId, devices.id))
    .leftJoin(socs, eq(socs.id, deviceModels.socId))
    .leftJoin(deviceAttestations, eq(deviceAttestations.deviceId, devices.id))
    .leftJoin(deviceRevocations, eq(deviceRevocations.deviceId, devices.id));
}

export type DeviceRow = Awaited<ReturnType<typeof selectDevices>>[number];

export function devicesOf(userId: string) {
  return db.select({ id: devices.id }).from(devices).where(eq(devices.userId, userId));
}

export function canManageDevices(req: FastifyRequest): Promise<boolean> {
  return hasStaffPermission(req, { observations: ["manage"] });
}

export async function findDevice(deviceId: string): Promise<DeviceRow> {
  const [row] = await selectDevices().where(eq(devices.id, deviceId)).limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  return row;
}

export async function findVisibleDevice(req: FastifyRequest, userId: string, deviceId: string): Promise<DeviceRow> {
  const row = await findDevice(deviceId);
  if (row.userId !== userId && !(await canManageDevices(req))) throw new ErrorResponse("NOT_FOUND");
  return row;
}

export async function loadDeviceOwners(rows: readonly DeviceRow[]): Promise<Map<string, UserRef>> {
  const ownerIds = [...new Set(rows.flatMap((row) => row.userId ?? []))];
  if (ownerIds.length === 0) return new Map();

  const owners = await db
    .select({ id: users.id, username: users.username, name: users.name, image: users.image })
    .from(users)
    .where(inArray(users.id, ownerIds));
  return new Map(owners.map((owner) => [owner.id, toUserRef(owner)]));
}

export function toMeasurementDevice(row: DeviceRow, owners?: ReadonlyMap<string, UserRef>): MeasurementDevice {
  const device: MeasurementDevice = {
    id: row.id,
    label: row.label,
    hardware: { manufacturer: row.manufacturer, model: row.model, socModel: row.socModel },
    attestation: {
      tier: row.tier,
      securityLevel: row.securityLevel,
      verifiedBootState: row.verifiedBootState,
      isBootloaderLocked: row.isBootloaderLocked,
    },
    isRevoked: row.revokedAt !== null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    revocationReason: row.revocationReason,
    createdAt: row.createdAt.toISOString(),
    lastUploadAt: row.lastUploadAt?.toISOString() ?? null,
  };
  if (owners) device.owner = row.userId === null ? null : (owners.get(row.userId) ?? null);
  return device;
}

async function writeDeviceChange(tx: DbTx, audit: AuditRecorder | null, device: DeviceRow, actorId: string, change: MeasurementDeviceUpdate) {
  const isRevoked = device.revokedAt !== null;
  if (change.label !== undefined) await tx.update(devices).set({ label: change.label }).where(eq(devices.id, device.id));
  if (change.isRevoked === true && !isRevoked) {
    const [revocation] = await tx
      .insert(deviceRevocations)
      .values({ deviceId: device.id, revokedById: actorId, reason: change.reason ?? null })
      .onConflictDoNothing()
      .returning();
    if (revocation) await audit?.log({ entity: "device_revocations", op: "create", recordId: device.id, new: revocation });
  }
  if (change.isRevoked === false && isRevoked) {
    const [revocation] = await tx.delete(deviceRevocations).where(eq(deviceRevocations.deviceId, device.id)).returning();
    if (revocation) await audit?.log({ entity: "device_revocations", op: "delete", recordId: device.id, old: revocation });
  }
}

export async function updateDevice(req: FastifyRequest, userId: string, deviceId: string, change: MeasurementDeviceUpdate): Promise<DeviceRow> {
  const device = await findVisibleDevice(req, userId, deviceId);
  const isOwn = device.userId === userId;
  const isRestore = change.isRevoked === false && device.revokedAt !== null;
  const isAdministration = !isOwn || isRestore || change.reason !== undefined;
  if (change.label !== undefined && !isOwn) throw new ErrorResponse("FORBIDDEN", { message: "Only the device's owner can rename it" });
  if (isAdministration && !(await canManageDevices(req))) {
    throw new ErrorResponse("FORBIDDEN", { message: "Only an administrator can restore a device or give a reason" });
  }

  if (isAdministration) {
    const kind = isRestore ? "observations.device_restore" : "observations.device_revoke";
    await runAuditedOperation(standaloneAuditContext(req), { kind }, (tx, audit) => writeDeviceChange(tx, audit, device, userId, change));
  } else {
    await db.transaction((tx) => writeDeviceChange(tx, null, device, userId, change));
  }
  return findDevice(deviceId);
}
