import { crowdSettings } from "@openbts/drizzle";
import { MEASUREMENT_DEVICE_LIMITS, MEASUREMENT_UPLOAD_LIMITS, MEASUREMENT_UPLOAD_QUOTAS } from "@openbts/shared/contract";
import type { MeasurementConfig } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import { createSelectSchema } from "drizzle-orm/zod";
import type { z } from "zod/v4";

import db from "../../database/psql.js";
import { ErrorResponse } from "../../errors.js";
import { getRuntimeSettings } from "../../lib/runtimeSettings.js";

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
