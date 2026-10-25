import { crowdSettings } from "@openbts/drizzle";
import { MEASUREMENT_DEVICE_LIMITS, MEASUREMENT_UPLOAD_LIMITS, MEASUREMENT_UPLOAD_QUOTAS } from "@openbts/shared/contract";
import type { MeasurementConfig, SettingsMeasurements } from "@openbts/shared/contract";
import { eq, sql } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { getRuntimeSettings } from "../../lib/runtimeSettings.js";
import type { DbTx } from "../../types/global.js";
import type { AuditRecorder } from "../audit/index.js";

const crowdSettingsSelectSchema = createSelectSchema(crowdSettings);
export type CrowdSettings = z.infer<typeof crowdSettingsSelectSchema>;

export async function loadCrowdSettings(): Promise<CrowdSettings> {
  const [settings] = await db.select().from(crowdSettings).where(eq(crowdSettings.id, 1)).limit(1);
  if (!settings) throw new ErrorResponse("SERVICE_UNAVAILABLE", { cause: new Error("observations.crowd_settings has no row") });
  return settings;
}

export function assertMeasurementUploadsEnabled(): void {
  if (!getRuntimeSettings().measurementUploadsEnabled) throw new ErrorResponse("FEATURE_DISABLED");
}

export function toMeasurementConfig(settings: CrowdSettings): MeasurementConfig {
  return {
    uploadsEnabled: getRuntimeSettings().measurementUploadsEnabled,
    minAppVersionCode: settings.minAppVersionCode,
    termsVersion: settings.termsVersion,
    limits: { upload: MEASUREMENT_UPLOAD_LIMITS, quotas: MEASUREMENT_UPLOAD_QUOTAS, devices: MEASUREMENT_DEVICE_LIMITS },
  };
}

export function toSettingsMeasurements(settings: CrowdSettings): SettingsMeasurements {
  return {
    rawRetentionDays: settings.rawRetentionDays,
    rawStorageBudgetGib: settings.rawStorageBudgetGb,
    minAppVersionCode: settings.minAppVersionCode,
    termsVersion: settings.termsVersion,
    publishedAlgorithmVersion: settings.publishedAlgorithmVersion,
    publicRadiusMaxMeters: settings.publicRadiusMaxM,
  };
}

function toCrowdSettingsColumns({ publicRadiusMaxMeters, rawStorageBudgetGib, ...columns }: Partial<SettingsMeasurements>) {
  return { ...columns, publicRadiusMaxM: publicRadiusMaxMeters, rawStorageBudgetGb: rawStorageBudgetGib };
}

export function changedCrowdSettings(
  settings: CrowdSettings,
  change: Partial<SettingsMeasurements> | undefined,
): Partial<SettingsMeasurements> | null {
  if (change === undefined) return null;
  const current = toSettingsMeasurements(settings);
  const changed = Object.fromEntries(Object.entries(change).filter(([key, value]) => current[key as keyof SettingsMeasurements] !== value));
  return Object.keys(changed).length === 0 ? null : changed;
}

export async function saveCrowdSettings(
  tx: DbTx,
  audit: AuditRecorder,
  old: CrowdSettings,
  changes: Partial<SettingsMeasurements>,
  actorId: string | null,
): Promise<CrowdSettings> {
  const [saved] = await tx
    .update(crowdSettings)
    .set({ ...toCrowdSettingsColumns(changes), updatedAt: sql`now()`, updatedById: actorId })
    .where(eq(crowdSettings.id, 1))
    .returning();
  if (!saved) throw new ErrorResponse("SERVICE_UNAVAILABLE", { cause: new Error("observations.crowd_settings has no row") });
  await audit.log({ entity: "crowd_settings", op: "update", recordId: 1, old, new: saved });
  return saved;
}
