import type { FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { ErrorResponse } from "../../errors.js";
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
import { assertRouteRules, keepExistingRouteRules } from "./routeRules.js";

const UPDATE_LOCK_KEY = "runtime:settings:lock";
const UPDATE_LOCK_TTL_SECONDS = 30;

export function canUpdateSettings(req: FastifyRequest): Promise<boolean> {
  return hasStaffPermission(req, { settings: ["update"] });
}

export async function updateSettings(context: AuditContext, patch: RuntimeSettingsPatch): Promise<RuntimeSettings> {
  assertRouteRules(patch, getRuntimeSettings());

  const lockToken = randomUUID();
  if (!(await acquireRedisLock(UPDATE_LOCK_KEY, lockToken, UPDATE_LOCK_TTL_SECONDS))) {
    throw new ErrorResponse("CONFLICT", { message: "Another change to the settings is being saved, try again" });
  }

  try {
    const stored = await loadStoredRuntimeSettings();
    assertRouteRules(patch, stored);
    const next = mergeRuntimeSettings(stored, patch);
    next.allowedUnauthenticatedRoutes = keepExistingRouteRules(next.allowedUnauthenticatedRoutes);
    next.disabledRoutes = keepExistingRouteRules(next.disabledRoutes);
    if (isDeepStrictEqual(stored, next)) return stored;

    return await runAuditedOperation(context, { kind: "settings.update" }, async (_tx, audit) => {
      await audit.log({ entity: "settings", op: "update", recordId: null, old: stored, new: next });
      await saveRuntimeSettings(next);
      return next;
    });
  } finally {
    await releaseOwnedRedisLock(UPDATE_LOCK_KEY, lockToken).catch((error) => logger.error("settings_update_lock_release_failed", { error }));
  }
}
