import { deviceRevocations, deviceWeights, devices } from "@openbts/drizzle";
import type { MeasurementDeviceUpdate } from "@openbts/shared/contract";
import { eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

import db from "../../../database/psql.js";
import { ErrorResponse, ValidationError } from "../../../errors.js";
import type { DbTx } from "../../../types/global.js";
import { type AuditRecorder, runAuditedOperation, standaloneAuditContext } from "../../audit/index.js";
import { canManageMeasurements } from "../access.js";
import { queueRefold } from "../engineRuns.js";
import { type DeviceRow, findDevice, findVisibleDevice } from "./read.js";

type DeviceWeightChange = Exclude<MeasurementDeviceUpdate["weight"], undefined>;

async function writeDeviceWeight(tx: DbTx, audit: AuditRecorder, deviceId: string, actorId: string, weight: DeviceWeightChange): Promise<void> {
  const [existing] = await tx.select().from(deviceWeights).where(eq(deviceWeights.deviceId, deviceId)).for("update");
  if (weight === null) {
    if (!existing) return;
    await tx.delete(deviceWeights).where(eq(deviceWeights.deviceId, deviceId));
    await audit.log({ entity: "device_weights", op: "delete", recordId: deviceId, old: existing });
    return;
  }

  const values = { weight: weight.value, reason: weight.reason, setById: actorId };
  if (existing !== undefined && Math.fround(existing.weight) === Math.fround(values.weight) && existing.reason === values.reason) return;

  const [saved] = await tx
    .insert(deviceWeights)
    .values({ deviceId, ...values })
    .onConflictDoUpdate({ target: deviceWeights.deviceId, set: { ...values, setAt: sql`now()` } })
    .returning();
  await audit.log({ entity: "device_weights", op: existing ? "update" : "create", recordId: deviceId, old: existing, new: saved });
}

async function writeDeviceChange(tx: DbTx, audit: AuditRecorder | null, device: DeviceRow, actorId: string, change: MeasurementDeviceUpdate) {
  const isRevoked = device.revokedAt !== null;
  if (change.label !== undefined) await tx.update(devices).set({ label: change.label }).where(eq(devices.id, device.id));
  if (change.isRevoked === true && !isRevoked) {
    const [revocation] = await tx
      .insert(deviceRevocations)
      .values({ deviceId: device.id, revokedById: actorId, reason: change.revocationReason ?? null })
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
  const { weight } = change;
  const isOwn = device.userId === userId;
  const isRestore = change.isRevoked === false && device.revokedAt !== null;
  const isAdministration = !isOwn || isRestore || change.revocationReason !== undefined || weight !== undefined;
  if (change.label !== undefined && !isOwn) throw new ErrorResponse("FORBIDDEN", { message: "Only the device's owner can rename it" });
  if (isAdministration && !(await canManageMeasurements(req))) {
    throw new ErrorResponse("FORBIDDEN", { message: "Only an administrator can restore a device, give a reason or set its weight" });
  }

  if (weight !== undefined) {
    const refoldUserId = change.refold === true ? device.userId : undefined;
    if (refoldUserId === null) throw new ValidationError([{ field: "refold", validationMessage: "The device's owner deleted their account" }]);
    await runAuditedOperation(
      standaloneAuditContext(req),
      { kind: "observations.device_weight", allowEmpty: refoldUserId !== undefined },
      async (tx, audit) => {
        await writeDeviceWeight(tx, audit, device.id, userId, weight);
        if (refoldUserId !== undefined) await queueRefold(tx, { userId: refoldUserId });
      },
    );
  } else if (isAdministration) {
    const kind = isRestore ? "observations.device_restore" : "observations.device_revoke";
    await runAuditedOperation(standaloneAuditContext(req), { kind }, (tx, audit) => writeDeviceChange(tx, audit, device, userId, change));
  } else {
    await db.transaction((tx) => writeDeviceChange(tx, null, device, userId, change));
  }
  return findDevice(deviceId);
}
