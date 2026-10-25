import type { FastifyRequest } from "fastify";

import { ErrorResponse } from "../../errors.js";
import { getRuntimeSettings } from "../../lib/runtimeSettings.js";
import { isAppClient } from "../../plugins/auth/appClient.js";
import { hasStaffPermission } from "../access/staff.js";

export function ownDataUserId(req: FastifyRequest): string | null {
  if (req.apiToken) return null;
  if (req.oauthToken && !isAppClient(req.oauthToken.clientId)) return null;
  return req.userSession?.user?.id ?? null;
}

export async function assertObservationsOn(req: FastifyRequest): Promise<void> {
  if (getRuntimeSettings().observationsEnabled) return;
  if (!(await hasStaffPermission(req, { observations: ["manage"] }))) throw new ErrorResponse("FEATURE_DISABLED");
}

export function assertPublicObservationsOn(): void {
  if (!getRuntimeSettings().observationsEnabled) throw new ErrorResponse("FEATURE_DISABLED");
}

export async function assertModeratesObservations(req: FastifyRequest): Promise<void> {
  if (!(await hasStaffPermission(req, { observations: ["moderate"] }))) throw new ErrorResponse("INSUFFICIENT_PERMISSIONS");
}
