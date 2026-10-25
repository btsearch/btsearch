import { siteEstimates } from "@openbts/drizzle";
import type { SettingsUpdate } from "@openbts/shared/contract";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import db from "../../database/psql.js";
import { DetailedErrorResponse } from "../../errors.js";
import { acquireRedisLock, releaseOwnedRedisLock } from "../../lib/redisLock.js";
import {
  type RuntimeSettings,
  type RuntimeSettingsPatch,
  getRuntimeSettings,
  loadStoredRuntimeSettings,
  mergeRuntimeSettings,
  saveRuntimeSettings,
} from "../../lib/runtimeSettings.js";
import { logger } from "../../utils/logger.js";
import { hasStaffPermission } from "../access/staff.js";
import { type AuditContext, runAuditedOperation } from "../audit/index.js";
import { type CrowdSettings, changedCrowdSettings, loadCrowdSettings, saveCrowdSettings } from "../measurements/settings.js";
import { assertRouteRules, keepExistingRouteRules } from "./routeRules.js";

export type UpdatedSettings = { runtime: RuntimeSettings; crowd: CrowdSettings };

const UPDATE_LOCK_KEY = "runtime:settings:lock";
const UPDATE_LOCK_TTL_SECONDS = 30;

export function canUpdateSettings(req: FastifyRequest): Promise<boolean> {
  return hasStaffPermission(req, { settings: ["update"] });
}

async function assertVersionEstimated(algorithmVersion: number | undefined): Promise<void> {
  if (algorithmVersion === undefined) return;
  const [estimate] = await db
    .select({ observedSiteId: siteEstimates.observedSiteId })
    .from(siteEstimates)
    .where(eq(siteEstimates.algorithmVersion, algorithmVersion))
    .limit(1);
  if (!estimate) throw new DetailedErrorResponse("CONFLICT", [{ kind: "noEstimate" }], { message: "No site has an estimate of this version yet" });
}

export async function updateSettings(
  context: AuditContext,
  patch: RuntimeSettingsPatch,
  measurements: SettingsUpdate["measurements"],
): Promise<UpdatedSettings> {
  assertRouteRules(patch, getRuntimeSettings());

  const lockToken = randomUUID();
  if (!(await acquireRedisLock(UPDATE_LOCK_KEY, lockToken, UPDATE_LOCK_TTL_SECONDS))) {
    throw new DetailedErrorResponse("CONFLICT", [{ kind: "busy" }], { message: "Another change to the settings is being saved, try again" });
  }

  try {
    const [stored, crowd] = await Promise.all([loadStoredRuntimeSettings(), loadCrowdSettings()]);
    assertRouteRules(patch, stored);
    const next = mergeRuntimeSettings(stored, patch);
    next.allowedUnauthenticatedRoutes = keepExistingRouteRules(next.allowedUnauthenticatedRoutes);
    next.disabledRoutes = keepExistingRouteRules(next.disabledRoutes);
    const isRuntimeChanged = !isDeepStrictEqual(stored, next);
    const crowdChanges = changedCrowdSettings(crowd, measurements);
    if (!isRuntimeChanged && crowdChanges === null) return { runtime: stored, crowd };
    await assertVersionEstimated(crowdChanges?.publishedAlgorithmVersion);

    return await runAuditedOperation(context, { kind: "settings.update" }, async (tx, audit) => {
      const savedCrowd = crowdChanges === null ? crowd : await saveCrowdSettings(tx, audit, crowd, crowdChanges, context.actorId);
      if (!isRuntimeChanged) return { runtime: stored, crowd: savedCrowd };

      await audit.log({ entity: "settings", op: "update", recordId: null, old: stored, new: next });
      await saveRuntimeSettings(next);
      return { runtime: next, crowd: savedCrowd };
    });
  } finally {
    await releaseOwnedRedisLock(UPDATE_LOCK_KEY, lockToken).catch((error) => logger.error("settings_update_lock_release_failed", { error }));
  }
}
