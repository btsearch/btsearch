import {
  deviceAttestations,
  deviceModels,
  deviceRevocations,
  deviceTiers,
  deviceWeightsNow,
  devices,
  socs,
  uploadFolds,
  uploads,
} from "@openbts/drizzle";
import type { MeasurementDeviceListQuery } from "@openbts/shared/contract";
import { type SQL, and, desc, eq, isNull, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { z } from "zod/v4";

import db from "../../../database/psql.js";
import { ErrorResponse } from "../../../errors.js";
import { decodeCursor } from "../../../lib/cursor.js";
import { createKeyset } from "../../../lib/keyset.js";
import { canManageMeasurements } from "../access.js";

const SORT_COLUMNS = {
  createdAt: { column: devices.createdAt, kind: "instant" },
  weight: { column: deviceWeightsNow.computedWeight, kind: "text" },
} as const;
const WEIGHT_CURSOR_SCHEMA = z.object({ key: z.string().regex(/^\d+(\.\d+)?(e-\d+)?$/) });

const lastUploadAt: SQL<Date | null> = sql`(SELECT max(${uploads.receivedAt}) FROM ${uploads} WHERE ${uploads.deviceId} = ${devices.id})`.mapWith(
  uploads.receivedAt,
);

function latestFoldedSoftware() {
  return db
    .select({
      sdkInt: uploadFolds.sdkInt,
      securityPatch: uploadFolds.securityPatch,
      radioVersion: uploadFolds.radioVersion,
      appVersionCode: uploads.appVersionCode,
      appVersionName: uploadFolds.appVersionName,
    })
    .from(uploads)
    .innerJoin(uploadFolds, eq(uploadFolds.uploadId, uploads.id))
    .where(and(eq(uploads.deviceId, devices.id), isNull(uploadFolds.unfoldedAt)))
    .orderBy(desc(uploads.receivedAt))
    .limit(1)
    .as("software");
}

export function selectDevices(sortKey: SQL<string | null> = sql<null>`NULL`) {
  const software = latestFoldedSoftware();
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
      revokedById: deviceRevocations.revokedById,
      revocationReason: deviceRevocations.reason,
      lastUploadAt,
      software: {
        sdkInt: software.sdkInt,
        securityPatch: software.securityPatch,
        radioVersion: software.radioVersion,
        appVersionCode: software.appVersionCode,
        appVersionName: software.appVersionName,
      },
      sortKey,
    })
    .from(devices)
    .innerJoin(deviceModels, eq(deviceModels.id, devices.modelId))
    .innerJoin(deviceTiers, eq(deviceTiers.deviceId, devices.id))
    .leftJoin(socs, eq(socs.id, deviceModels.socId))
    .leftJoin(deviceAttestations, eq(deviceAttestations.deviceId, devices.id))
    .leftJoin(deviceRevocations, eq(deviceRevocations.deviceId, devices.id))
    .leftJoinLateral(software, sql`true`);
}

export type DeviceRow = Awaited<ReturnType<typeof selectDevices>>[number];

export function isWeightSort(sort: MeasurementDeviceListQuery["sort"]): boolean {
  return sort === "weight" || sort === "-weight";
}

export function selectDevicePage(sort: MeasurementDeviceListQuery["sort"], cursor: string | undefined) {
  if (isWeightSort(sort) && cursor !== undefined) decodeCursor(cursor, WEIGHT_CURSOR_SCHEMA);
  const keyset = createKeyset(sort, devices.id, SORT_COLUMNS, cursor, z.uuid());
  const query = selectDevices(keyset.key).$dynamic();
  return { keyset, query: isWeightSort(sort) ? query.innerJoin(deviceWeightsNow, eq(deviceWeightsNow.deviceId, devices.id)) : query };
}

export function devicesOf(userId: string) {
  return db.select({ id: devices.id }).from(devices).where(eq(devices.userId, userId));
}

export async function findDevice(deviceId: string): Promise<DeviceRow> {
  const [row] = await selectDevices().where(eq(devices.id, deviceId)).limit(1);
  if (!row) throw new ErrorResponse("NOT_FOUND");
  return row;
}

export async function findVisibleDevice(req: FastifyRequest, userId: string, deviceId: string): Promise<DeviceRow> {
  const row = await findDevice(deviceId);
  if (row.userId !== userId && !(await canManageMeasurements(req))) throw new ErrorResponse("NOT_FOUND");
  return row;
}
