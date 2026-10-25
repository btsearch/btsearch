import { deviceWeights, deviceWeightsNow, devices, users } from "@openbts/drizzle";
import type { MeasurementDevice, MeasurementDeviceTimingAdvance, MeasurementDeviceWeight, UserRef } from "@openbts/shared/contract";
import { eq, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { FastifyRequest } from "fastify";

import db from "../../../database/psql.js";
import { unique } from "../../../lib/collections.js";
import { loadUserRefs, toUserRef } from "../../users/userRef.js";
import { canManageMeasurements } from "../access.js";
import { loadTimingAdvance } from "./calibration.js";
import { type DeviceRow, selectDevices } from "./read.js";

type AdministratorDetails = {
  weights?: ReadonlyMap<string, MeasurementDeviceWeight>;
  revokers?: ReadonlyMap<string, UserRef>;
};
type DeviceDetails = AdministratorDetails & {
  timingAdvance: ReadonlyMap<string, MeasurementDeviceTimingAdvance[]>;
  owners?: ReadonlyMap<string, UserRef>;
};

async function loadDeviceWeights(deviceIds: readonly string[]): Promise<Map<string, MeasurementDeviceWeight>> {
  if (deviceIds.length === 0) return new Map();

  const setter = alias(users, "setter");
  const rows = await db
    .select({
      deviceId: devices.id,
      computed: deviceWeightsNow.computedWeight,
      effective: deviceWeightsNow.weight,
      basis: deviceWeightsNow.basis,
      own: { value: deviceWeights.weight, reason: deviceWeights.reason, setAt: deviceWeights.setAt },
      setBy: { id: setter.id, username: setter.username, name: setter.name, image: setter.image },
    })
    .from(devices)
    .innerJoin(deviceWeightsNow, eq(deviceWeightsNow.deviceId, devices.id))
    .leftJoin(deviceWeights, eq(deviceWeights.deviceId, devices.id))
    .leftJoin(setter, eq(setter.id, deviceWeights.setById))
    .where(inArray(devices.id, [...deviceIds]));
  return new Map(
    rows.map(({ deviceId, own, setBy, ...weight }) => [
      deviceId,
      {
        ...weight,
        own:
          own === null ? null : { value: own.value, reason: own.reason, by: setBy === null ? null : toUserRef(setBy), at: own.setAt.toISOString() },
      },
    ]),
  );
}

async function loadAdministratorDetails(rows: readonly DeviceRow[]): Promise<AdministratorDetails> {
  const [weights, revokers] = await Promise.all([loadDeviceWeights(rows.map((row) => row.id)), loadUserRefs(rows.map((row) => row.revokedById))]);
  return { weights, revokers };
}

export async function loadDeviceDetails(req: FastifyRequest, rows: readonly DeviceRow[], includesOwner = false): Promise<DeviceDetails> {
  const [timingAdvance, administratorDetails, owners] = await Promise.all([
    loadTimingAdvance(rows.map((row) => row.id)),
    canManageMeasurements(req).then((canManage) => (canManage ? loadAdministratorDetails(rows) : {})),
    includesOwner ? loadUserRefs(rows.map((row) => row.userId)) : undefined,
  ]);
  return { timingAdvance, ...administratorDetails, owners };
}

function toRevocation(row: DeviceRow, revokers: ReadonlyMap<string, UserRef> | undefined): MeasurementDevice["revocation"] {
  if (row.revokedAt === null) return null;
  const revocation: NonNullable<MeasurementDevice["revocation"]> = { reason: row.revocationReason, at: row.revokedAt.toISOString() };
  if (revokers) revocation.by = row.revokedById === null ? null : (revokers.get(row.revokedById) ?? null);
  return revocation;
}

export function toMeasurementDevice(row: DeviceRow, { timingAdvance, weights, revokers, owners }: DeviceDetails): MeasurementDevice {
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
    revocation: toRevocation(row, revokers),
    createdAt: row.createdAt.toISOString(),
    lastUploadAt: row.lastUploadAt?.toISOString() ?? null,
    software: row.software,
    timingAdvance: timingAdvance.get(row.id) ?? [],
  };
  const weight = weights?.get(row.id);
  if (weight) device.weight = weight;
  if (owners) device.owner = row.userId === null ? null : (owners.get(row.userId) ?? null);
  return device;
}

export async function findDevices(req: FastifyRequest, deviceIds: readonly string[]): Promise<Map<string, MeasurementDevice>> {
  const ids = unique(deviceIds);
  if (ids.length === 0) return new Map();

  const rows = await selectDevices().where(inArray(devices.id, ids));
  const details = await loadDeviceDetails(req, rows);
  return new Map(rows.map((row) => [row.id, toMeasurementDevice(row, details)]));
}
