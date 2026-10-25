import { attestationRevocations, deviceCertificates, deviceRevocations, observationFlags } from "@openbts/drizzle";
import { asc, eq, exists, notExists } from "drizzle-orm";

import db from "../../../database/psql.js";
import type { RaisedFlag } from "./kinds.js";
import { deviceSubject } from "./subjects.js";
import { type FlagSyncCounts, syncFlags } from "./sync.js";

export type ListedCertificate = { deviceId: string; serial: Buffer; status: "revoked" | "suspended" };

function listedSerial(serial: Buffer): string {
  return BigInt(`0x${serial.toString("hex")}`).toString(16);
}

export function raiseDeviceFlags(listed: readonly ListedCertificate[]): RaisedFlag<"deviceRevoked">[] {
  return listed.map(({ deviceId, serial, status }) => {
    const revocation = { serial: listedSerial(serial), revocationStatus: status };
    return {
      kind: "deviceRevoked",
      subjectKey: deviceSubject(deviceId),
      refs: { deviceId },
      evidence: revocation,
      suggestion: null,
      measure: revocation,
    };
  });
}

async function loadListedCertificates(): Promise<ListedCertificate[]> {
  const isRevoked = db
    .select({ id: deviceRevocations.deviceId })
    .from(deviceRevocations)
    .where(eq(deviceRevocations.deviceId, deviceCertificates.deviceId));
  return db
    .selectDistinctOn([deviceCertificates.deviceId], {
      deviceId: deviceCertificates.deviceId,
      serial: deviceCertificates.serial,
      status: attestationRevocations.status,
    })
    .from(deviceCertificates)
    .innerJoin(attestationRevocations, eq(attestationRevocations.serial, deviceCertificates.serial))
    .where(notExists(isRevoked))
    .orderBy(deviceCertificates.deviceId, asc(deviceCertificates.position));
}

export async function syncDeviceFlags(): Promise<FlagSyncCounts> {
  const raised = raiseDeviceFlags(await loadListedCertificates());
  const isRevoked = db
    .select({ id: deviceRevocations.deviceId })
    .from(deviceRevocations)
    .where(eq(deviceRevocations.deviceId, observationFlags.deviceId));
  return db.transaction((tx) => syncFlags(tx, { kinds: ["deviceRevoked"], raised, fixed: exists(isRevoked) }));
}
